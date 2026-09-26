// Production entry point: serves the built client (dist/client) and the game.
// Run with `npm start` after `npm run build`; for development use `npm run dev`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChessServer } from './app.ts';

const DEFAULT_PORT = 3000;

function readInteger(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(
      `${name} must be an integer between ${String(min)} and ${String(max)}, got "${value}"`,
    );
  }
  return number;
}

const port = readInteger('PORT', DEFAULT_PORT, 0, 65535);
// New Socket.IO connections allowed per minute and client address.
const connectionsPerMinute = readInteger('CONNECTIONS_PER_MINUTE', 30, 1, 100_000);
// Listen on all interfaces by default (as before) so players on the same
// network can join; set HOST=127.0.0.1 to restrict it to this machine.
const host = process.env.HOST ?? undefined;
const staticDir = fileURLToPath(new URL('../../dist/client', import.meta.url));

if (!existsSync(join(staticDir, 'index.html'))) {
  console.warn('dist/client not found: run "npm run build" first, or use "npm run dev".');
}

const server = createChessServer({ staticDir, connectionsPerMinute });
const address = await server.listen(port, host);
console.log(`Chess server listening on http://localhost:${String(address.port)}`);

function shutdown(): void {
  void server.close().finally(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
