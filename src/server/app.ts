import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import { Server, type Socket } from 'socket.io';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';
import { RateLimiter } from './rate-limit.ts';
import { GameRoom, type Player, type RoomOptions } from './room.ts';
import { isAck, parseChatText, parseMoveRequest, parseName } from './validation.ts';

export interface GameServerOptions {
  readonly room?: RoomOptions;
  /** Socket events allowed per second and socket before requests are refused. */
  readonly eventsPerSecond?: number;
  /** New connections allowed per minute and client address. */
  readonly connectionsPerMinute?: number;
}

export interface ChessServerOptions extends GameServerOptions {
  /** Directory with the built client (index.html, assets). Omit to serve no files. */
  readonly staticDir?: string;
}

export interface GameServer {
  readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  readonly room: GameRoom;
  close(): Promise<void>;
}

export interface ChessServer extends GameServer {
  readonly httpServer: HttpServer;
  listen(port: number, host?: string): Promise<AddressInfo>;
}

/** Largest accepted Socket.IO message; real payloads are well under 1 KiB. */
const MAX_MESSAGE_BYTES = 16 * 1024;

const securityHeaders: RequestHandler = (_request, response, next) => {
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

type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

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

/**
 * Attaches Socket.IO and a GameRoom to an existing HTTP server. Used by
 * createChessServer and by the Vite dev server plugin (vite.config.ts).
 */
export function attachGameServer(
  httpServer: HttpServer,
  options: GameServerOptions = {},
): GameServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });
  const room = new GameRoom(
    {
      snapshot: (snapshot) => io.emit('room', snapshot),
      chat: (message) => io.emit('chat', message),
    },
    options.room,
  );
  const eventsPerSecond = options.eventsPerSecond ?? 20;

  // Every connection without a known session creates a player and a join
  // notice, so connection floods are limited per client address.
  const connectionLimiters = new Map<string, RateLimiter>();
  const connectionsPerMinute = options.connectionsPerMinute ?? 30;
  io.use((socket, next) => {
    const address = socket.handshake.address;
    if (connectionLimiters.size > 10_000) connectionLimiters.clear();
    let limiter = connectionLimiters.get(address);
    if (!limiter) {
      limiter = new RateLimiter(connectionsPerMinute, 60_000);
      connectionLimiters.set(address, limiter);
    }
    next(limiter.tryTake() ? undefined : new Error('rate-limited'));
  });

  io.on('connection', (socket: ClientSocket) => {
    // History first, so the join notice produced by connect() is not duplicated.
    socket.emit('chat:history', room.chatHistory());
    // The Socket.IO parser only accepts an object as CONNECT payload.
    const auth: Record<string, unknown> = socket.handshake.auth;
    const player = room.connect({ token: auth.token, name: auth.name });
    socket.emit('session', { token: player.token, playerId: player.id, name: player.name });
    socket.emit('room', room.snapshot());

    const limiter = new RateLimiter(eventsPerSecond, 1000);
    bindEvents(socket, room, player, limiter);
    socket.on('disconnect', () => {
      room.disconnect(player);
    });
  });

  return {
    io,
    room,
    close: async () => {
      room.dispose();
      await io.close();
    },
  };
}

/**
 * Registers the client events. Every handler validates its payload, applies
 * the per-socket rate limit and answers through the acknowledgement callback
 * when the client provided one. Unknown events (such as the legacy
 * "gameend" or "movefinish") are simply never handled.
 */
function bindEvents(
  socket: ClientSocket,
  room: GameRoom,
  player: Player,
  limiter: RateLimiter,
): void {
  const on = <T>(
    event: keyof ClientToServerEvents,
    parse: ((value: unknown) => T | null) | null,
    action: (payload: T) => AckResult,
  ) => {
    socket.on(event, (...args: unknown[]) => {
      const ack = args.at(-1);
      const reply = (result: AckResult) => {
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
      reply(action(payload as T));
    });
  };

  on('profile:set-name', parseName, (name) => {
    const result = room.setName(player, name);
    if (result.ok) socket.emit('session', { token: player.token, playerId: player.id, name });
    return result;
  });
  on('seat:take', null, () => room.takeSeat(player));
  on('seat:leave', null, () => room.leaveSeat(player));
  on('game:move', parseMoveRequest, (move) => room.move(player, move));
  on('game:resign', null, () => room.resign(player));
  on('game:offer-draw', null, () => room.offerDraw(player));
  on('game:accept-draw', null, () => room.acceptDraw(player));
  on('game:decline-draw', null, () => room.declineDraw(player));
  on('chat:send', parseChatText, (text) => room.chat(player, text));
}
