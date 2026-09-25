// Production entry point: serves the built client (dist/client) and the game.
// Run with `npm start` after `npm run build`; for development use `npm run dev`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChessServer } from './app.ts';

const DEFAULT_PORT = 3000;

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${value}"`);
  }
  return port;
}

const port = readPort(process.env.PORT);
// Listen on all interfaces by default (as before) so players on the same
// network can join; set HOST=127.0.0.1 to restrict it to this machine.
const host = process.env.HOST ?? undefined;
const staticDir = fileURLToPath(new URL('../../dist/client', import.meta.url));

if (!existsSync(join(staticDir, 'index.html'))) {
  console.warn('dist/client not found: run "npm run build" first, or use "npm run dev".');
}

const server = createChessServer({ staticDir });
const address = await server.listen(port, host);
console.log(`Chess server listening on http://localhost:${String(address.port)}`);

function shutdown(): void {
  void server.close().finally(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
