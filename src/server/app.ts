import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import { Server, type ServerOptions, type Socket } from 'socket.io';
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
} from '../shared/protocol.ts';
import * as logic from './logic.ts';
import type { SessionRecord } from './model.ts';
import { RateLimiter } from './rate-limit.ts';
import { ChessService, type RoomAction, type ServiceOptions } from './service.ts';
import { MemoryStore, type Store } from './store.ts';
import {
  isAck,
  parseChatText,
  parseMoveRequest,
  parseName,
  parseRoomId,
  parseRoomName,
} from './validation.ts';

export interface GameServerOptions {
  /** Where rooms, sessions and presence live; defaults to process memory. */
  readonly store?: Store;
  readonly service?: ServiceOptions;
  /** Extra Socket.IO options, e.g. a Redis adapter shared by several instances. */
  readonly socket?: Partial<ServerOptions>;
  /** Socket events allowed per second and socket before requests are refused. */
  readonly eventsPerSecond?: number;
  /** New connections allowed per minute and client address. */
  readonly connectionsPerMinute?: number;
  /**
   * Request header with the client's address when running behind a trusted
   * proxy that sets it (Vercel sets `x-real-ip`); otherwise the socket address.
   */
  readonly clientAddressHeader?: string;
}

export interface ChessServerOptions extends GameServerOptions {
  /** Directory with the built client (index.html, assets). Omit to serve no files. */
  readonly staticDir?: string;
}

export interface GameServer {
  readonly io: Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
  readonly service: ChessService;
  close(): Promise<void>;
}

export interface ChessServer extends GameServer {
  readonly httpServer: HttpServer;
  listen(port: number, host?: string): Promise<AddressInfo>;
}

interface SocketData {
  session: SessionRecord;
}

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

/** Largest accepted Socket.IO message; real payloads are well under 1 KiB. */
const MAX_MESSAGE_BYTES = 16 * 1024;

export const securityHeaders: RequestHandler = (_request, response, next) => {
  response.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
};

/**
 * Creates the HTTP server (static client + security headers) with the game
 * attached. The client is served from the same origin, so no CORS
 * configuration is needed (the original allowed any origin with
 * `cors: { origin: '*' }`).
 */
export function createChessServer(options: ChessServerOptions = {}): ChessServer {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  if (options.staticDir) app.use(express.static(options.staticDir));

  const httpServer = createServer(app);
  const game = attachGameServer(httpServer, options);
  return {
    ...game,
    httpServer,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address() as AddressInfo);
        });
      }),
  };
}

const lobbyChannel = 'lobby';
const roomChannel = (roomId: string) => `room:${roomId}`;

/**
 * Attaches Socket.IO and the game service to an existing HTTP server. Used by
 * createChessServer, the Vite dev server plugin and the Vercel function.
 */
export function attachGameServer(
  httpServer: HttpServer,
  options: GameServerOptions = {},
): GameServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(
    httpServer,
    {
      path: SOCKET_PATH,
      addTrailingSlash: false,
      serveClient: false,
      maxHttpBufferSize: MAX_MESSAGE_BYTES,
      ...options.socket,
    },
  );
  const store = options.store ?? new MemoryStore();
  const service = new ChessService(
    store,
    {
      room: (roomId, snapshot) => io.to(roomChannel(roomId)).emit('room', snapshot),
      lobby: (snapshot) => io.to(lobbyChannel).emit('lobby', snapshot),
    },
    options.service,
  );
  const eventsPerSecond = options.eventsPerSecond ?? 20;

  // Every connection without a known session creates a player, so connection
  // floods are limited per client address.
  const connectionLimiters = new Map<string, RateLimiter>();
  const connectionsPerMinute = options.connectionsPerMinute ?? 30;
  io.use((socket, next) => {
    const header = options.clientAddressHeader
      ? socket.handshake.headers[options.clientAddressHeader]
      : undefined;
    const address = (typeof header === 'string' && header) || socket.handshake.address;
    if (connectionLimiters.size > 10_000) connectionLimiters.clear();
    let limiter = connectionLimiters.get(address);
    if (!limiter) {
      limiter = new RateLimiter(connectionsPerMinute, 60_000);
      connectionLimiters.set(address, limiter);
    }
    next(limiter.tryTake() ? undefined : new Error('rate-limited'));
  });

  // Resolve the session before the connection is accepted, so every event
  // handler can rely on it. The Socket.IO parser only accepts an object as
  // the CONNECT payload.
  io.use((socket, next) => {
    const auth: Record<string, unknown> = socket.handshake.auth;
    service
      .connect({ token: auth.token, name: auth.name })
      .then((session) => {
        socket.data.session = session;
        next();
      })
      .catch((error: unknown) => {
        console.error('session lookup failed', error);
        next(new Error('server-error'));
      });
  });

  io.on('connection', (socket: ClientSocket) => {
    const { session } = socket.data;
    service.attach(socket.id, session);
    socket.emit('session', { token: session.token, playerId: session.id, name: session.name });
    bindEvents(socket, service, new RateLimiter(eventsPerSecond, 1000));
    socket.on('disconnect', () => {
      service.detach(socket.id).catch((error: unknown) => {
        console.error('detach failed', error);
      });
    });
  });

  return {
    io,
    service,
    close: async () => {
      service.dispose();
      await io.close();
      await store.close();
    },
  };
}

type Reply = (
  result: { ok: true } | { ok: false; error: ErrorCode } | { ok: true; roomId: string },
) => void;

/**
 * Registers the client events. Every handler validates its payload, applies
 * the per-socket rate limit and answers through the acknowledgement callback
 * when the client provided one. Unknown events (such as the legacy
 * "gameend" or "movefinish") are simply never handled.
 */
function bindEvents(socket: ClientSocket, service: ChessService, limiter: RateLimiter): void {
  const on = <T>(
    event: keyof ClientToServerEvents,
    parse: ((value: unknown) => T | null) | null,
    handler: (payload: T, reply: Reply) => Promise<void>,
  ) => {
    socket.on(event, (...args: unknown[]) => {
      const ack = args.at(-1);
      const reply: Reply = (result) => {
        if (isAck(ack)) ack(result);
      };
      if (!limiter.tryTake()) {
        reply({ ok: false, error: 'rate-limited' });
        return;
      }
      const payload = parse ? parse(args[0]) : (undefined as T);
      if (parse && payload === null) {
        reply({ ok: false, error: 'invalid-payload' });
        return;
      }
      handler(payload as T, reply).catch((error: unknown) => {
        console.error(`${event} failed`, error);
        reply({ ok: false, error: 'server-error' });
      });
    });
  };
  const session = () => socket.data.session;
  const act = (action: RoomAction) => async (_payload: unknown, reply: Reply) => {
    reply(await service.act(socket.id, action));
  };

  on('profile:set-name', parseName, async (name, reply) => {
    socket.data.session = await service.rename(session(), name);
    socket.emit('session', { token: session().token, playerId: session().id, name });
    reply({ ok: true });
  });

  on('lobby:enter', null, async (_payload, reply) => {
    const roomId = service.roomOf(socket.id);
    await service.leave(socket.id);
    if (roomId) await socket.leave(roomChannel(roomId));
    await socket.join(lobbyChannel);
    socket.emit('lobby', await service.lobby());
    reply({ ok: true });
  });

  // parseRoomName returns undefined for an invalid name and null for "default".
  on(
    'room:create',
    (value) => {
      const name = parseRoomName(value);
      return name === undefined ? null : { name };
    },
    async ({ name }, reply) => {
      if (!service.allow(`create:${session().id}`, 3, 60_000)) {
        reply({ ok: false, error: 'rate-limited' });
        return;
      }
      reply(await service.createRoom(session(), name));
    },
  );

  on('room:join', parseRoomId, async (roomId, reply) => {
    const previous = service.roomOf(socket.id);
    // Join the channel first so the snapshot broadcast by join() reaches us.
    await socket.join(roomChannel(roomId));
    const result = await service.join(socket.id, roomId);
    if (!result.ok) {
      if (previous !== roomId) await socket.leave(roomChannel(roomId));
      reply(result);
      return;
    }
    if (previous && previous !== roomId) await socket.leave(roomChannel(previous));
    await socket.leave(lobbyChannel);
    reply(result);
  });

  on('room:sync', null, async (_payload, reply) => {
    const roomId = service.roomOf(socket.id);
    if (!roomId) {
      reply({ ok: false, error: 'not-in-room' });
      return;
    }
    await service.sync(roomId);
    reply({ ok: true });
  });

  on('seat:take', null, act(logic.takeSeat));
  on('seat:leave', null, act(logic.leaveSeat));
  on('game:move', parseMoveRequest, async (move, reply) => {
    reply(await service.act(socket.id, (room, player, ctx) => logic.move(room, player, move, ctx)));
  });
  on('game:resign', null, act(logic.resign));
  on('game:offer-draw', null, act(logic.offerDraw));
  on('game:accept-draw', null, act(logic.acceptDraw));
  on('game:decline-draw', null, act(logic.declineDraw));
  on('chat:send', parseChatText, async (text, reply) => {
    if (!service.allow(`chat:${session().id}`, 5, 10_000)) {
      reply({ ok: false, error: 'rate-limited' });
      return;
    }
    reply(await service.act(socket.id, (room, player, ctx) => logic.chat(room, player, text, ctx)));
  });
}
