// The dev server's config. Asked to listen on the LAN (`npm run dev -- --host`), as to try the map on a phone at
// the Mac's address (#471), it serves the live files itself, under /live, and the page reads them there: the page
// on the phone has the LAN address as its origin, which the live bucket's CORS doesn't allow (r2-cors.json).
// Otherwise, as on localhost:5173, and in a build, the page reads the bucket itself, as the site does.
// ponytail: the page is pointed at /live by rewriting LIVE_URL's line in bundle.ts as it's served, so were that
// line written otherwise, the page on the phone would read the bucket and get nothing. Read the URL from an env
// variable in bundle.ts if it moves.
import { defineConfig } from 'vite';
import { LIVE_URL } from './src/bundle.ts';

const lan = process.argv.some((arg) => arg === '--host' || arg.startsWith('--host='));

export default defineConfig(
  lan
    ? {
        server: { proxy: { '/live': { target: LIVE_URL, changeOrigin: true, rewrite: (path) => path.slice('/live'.length) } } },
        // Before TypeScript's types are stripped, which writes the line in other quotes.
        plugins: [{ name: 'live-files-through-the-dev-server', apply: 'serve', enforce: 'pre', transform: (code, id) => (id.endsWith('/src/bundle.ts') ? code.replace(`'${LIVE_URL}'`, "'/live'") : undefined) }],
      }
    : {},
);
