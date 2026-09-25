import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type RequestResult =
  AckResult | { readonly ok: false; readonly error: 'timeout' | 'disconnected' };

const TOKEN_KEY = 'chess.session';
const NAME_KEY = 'chess.name';

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

// The session token is per tab (sessionStorage) so two tabs are two players;
// the preferred name is remembered across visits (localStorage).
export const savedToken = () => read(() => sessionStorage, TOKEN_KEY);
export const saveToken = (token: string) => {
  write(() => sessionStorage, TOKEN_KEY, token);
};
export const savedName = () => read(() => localStorage, NAME_KEY);
export const saveName = (name: string) => {
  write(() => localStorage, NAME_KEY, name);
};

/** Creates the socket without connecting; call `socket.connect()` when ready. */
export function createSocket(): GameSocket {
  return io({
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
