import type { Server as HttpServer } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { attachGameServer } from './src/server/app.ts';

/**
 * Runs the game server (Socket.IO + GameRoom) inside the Vite dev/preview
 * server, so `npm run dev` is a single process with hot module reloading for
 * the client on the same origin as the socket.
 */
function gameServer(): Plugin {
  const attach = (httpServer: unknown) => {
    if (!httpServer) return;
    const server = httpServer as HttpServer;
    const game = attachGameServer(server);
    server.once('close', () => {
      void game.close();
    });
  };
  return {
    name: 'chess-game-server',
    configureServer: (server) => {
      attach(server.httpServer);
    },
    configurePreviewServer: (server) => {
      attach(server.httpServer);
    },
  };
}

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  plugins: [gameServer()],
});
