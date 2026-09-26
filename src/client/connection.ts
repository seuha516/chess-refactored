import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_PATH,
  type AckResult,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '../shared/protocol.ts';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type RequestResult =
  AckResult | { readonly ok: false; readonly error: 'timeout' | 'disconnected' };

const TOKEN_KEY = 'chess.session';
const RECENT_KEY = 'chess.sessions';
const NAME_KEY = 'chess.name';
/** A session left by a closed tab is taken over only if it was used this recently. */
const RESUME_WINDOW_MS = 12 * 60 * 60_000;
const MAX_RECENT = 6;

/**
 * Browser storage can be unavailable (private mode, blocked cookies); the
 * game still works, it just cannot resume the session after a reload.
 */
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // ignore
  }
}

// The session token is per tab (sessionStorage) so two open tabs are two
// players. Every tab also records its token in localStorage and holds a Web
// Lock on it while it is open; a new tab takes over the most recent token that
// no open tab holds. Closing the tab in the middle of a game and opening the
// link again therefore resumes the same player.

interface RecentSession {
  readonly token: string;
  readonly at: number;
}

function recentSessions(): RecentSession[] {
  try {
    const parsed: unknown = JSON.parse(read(() => localStorage, RECENT_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentSession =>
        typeof (entry as RecentSession | null)?.token === 'string' &&
        typeof (entry as RecentSession | null)?.at === 'number',
    );
  } catch {
    return [];
  }
}

function rememberSession(token: string, drop: string | null): void {
  const others = recentSessions().filter((entry) => entry.token !== token && entry.token !== drop);
  const next = [{ token, at: Date.now() }, ...others].slice(0, MAX_RECENT);
  write(() => localStorage, RECENT_KEY, JSON.stringify(next));
}

const lockName = (token: string) => `chess.session.${token}`;
/** Tokens this tab holds a lock on, with the function that lets go of it. */
const held = new Map<string, () => void>();
const queued = new Set<string>();

/** Holds the lock on `token` for as long as the tab is open (or until released). */
function hold(token: string, ifAvailable: boolean): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks || held.has(token)) return Promise.resolve(held.has(token));
  if (!ifAvailable) {
    if (queued.has(token)) return Promise.resolve(false);
    queued.add(token);
  }
  return new Promise((resolve) => {
    locks
      .request(lockName(token), { ifAvailable }, (lock) => {
        queued.delete(token);
        resolve(lock !== null);
        if (!lock) return undefined;
        return new Promise<void>((release) => {
          held.set(token, release);
        });
      })
      .catch(() => {
        resolve(false);
      });
  });
}

/**
 * Chooses this tab's session before the first connection: its own token after
 * a reload, otherwise the most recent one that no open tab holds.
 */
export async function claimSession(): Promise<void> {
  const own = read(() => sessionStorage, TOKEN_KEY);
  if (own) {
    // After a reload the previous page may still hold the lock for a moment.
    void hold(own, false);
    return;
  }
  const now = Date.now();
  for (const { token, at } of recentSessions()) {
    if (now - at > RESUME_WINDOW_MS) continue;
    if (await hold(token, true)) {
      write(() => sessionStorage, TOKEN_KEY, token);
      return;
    }
  }
}

export const savedToken = () => read(() => sessionStorage, TOKEN_KEY);
export const saveToken = (token: string) => {
  const previous = savedToken();
  write(() => sessionStorage, TOKEN_KEY, token);
  // A token the server no longer knew is replaced by the new one.
  const replaced = previous && previous !== token ? previous : null;
  rememberSession(token, replaced);
  if (replaced) {
    held.get(replaced)?.();
    held.delete(replaced);
  }
  void hold(token, false);
};
export const savedName = () => read(() => localStorage, NAME_KEY);
export const saveName = (name: string) => {
  write(() => localStorage, NAME_KEY, name);
};

/** Creates the socket without connecting; call `socket.connect()` when ready. */
export function createSocket(): GameSocket {
  return io({
    path: SOCKET_PATH,
    addTrailingSlash: false,
    // Vercel functions accept WebSocket upgrades but not HTTP long-polling.
    transports: ['websocket'],
    autoConnect: false,
    // Read on every (re)connection attempt, so a reconnect resumes the session.
    auth: (callback) => {
      callback({ token: savedToken(), name: savedName() });
    },
  });
}

/** Sends a request and resolves with the server's acknowledgement. */
export function request(
  socket: GameSocket,
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<RequestResult> {
  if (!socket.connected) return Promise.resolve({ ok: false, error: 'disconnected' });
  return new Promise((resolve) => {
    // Typed emit cannot express "any request event with its arguments".
    const timed = socket.timeout(5000) as unknown as {
      emit: (event: string, ...rest: unknown[]) => void;
    };
    timed.emit(event, ...args, (error: Error | null, result: AckResult) => {
      resolve(error ? { ok: false, error: 'timeout' } : result);
    });
  });
}
