// Produces the Vercel Build Output API directory (.vercel/output) from the
// Vite client build (dist/client) and a bundled Socket.IO function, so the
// deployment does not depend on Vercel's framework detection.
// Run by `npm run vercel-build` (which Vercel uses as the build command).
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = '.vercel/output';
const functionDir = `${output}/functions/api/socket.func`;

const securityHeaders = {
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
};

await rm(output, { recursive: true, force: true });
await mkdir(functionDir, { recursive: true });
await cp('dist/client', `${output}/static`, { recursive: true });

await build({
  entryPoints: ['src/server/vercel.ts'],
  outfile: `${functionDir}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  legalComments: 'none',
  // Optional native accelerators of the "ws" package; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  // Some bundled dependencies are CommonJS and call require() at runtime.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await writeFile(
  `${functionDir}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: true,
      // Hobby maximum; clients reconnect when the function closes the socket.
      maxDuration: 300,
      // Tokyo, next to the Upstash Redis database (and close to players in Korea).
      regions: ['hnd1'],
    },
    null,
    2,
  ),
);

await writeFile(
  `${output}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/(.*)', headers: securityHeaders, continue: true },
        { handle: 'filesystem' },
      ],
    },
    null,
    2,
  ),
);

console.log(`Vercel build output written to ${output}`);
