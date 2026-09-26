// Entry point of the Vercel function (bundled by scripts/build-vercel.ts into
// .vercel/output/functions/api/socket.func). Vercel runs several instances of
// it and closes each WebSocket after at most 5 minutes, so rooms, sessions and
// presence live in Redis and Socket.IO broadcasts go through the Redis adapter.
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { attachGameServer, type GameServerOptions } from './app.ts';
import { RedisStore } from './redis-store.ts';

// Vercel's Upstash (Redis) integration provides REDIS_URL / KV_URL.
const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL;

function redisOptions(): GameServerOptions {
  if (!redisUrl) {
    console.error(
      'REDIS_URL is not set: using in-memory state, which is NOT shared between function ' +
        'instances. Connect a Redis database to the Vercel project.',
    );
    return {};
  }
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  return {
    store: new RedisStore(redis),
    socket: { adapter: createAdapter(redis.duplicate(), redis.duplicate()) },
  };
}

// Socket.IO answers requests on its path; anything else reaching the function is unknown.
const server = createServer((_request, response) => {
  response.statusCode = 404;
  response.end();
});

attachGameServer(server, { ...redisOptions(), clientAddressHeader: 'x-real-ip' });

export default server;
