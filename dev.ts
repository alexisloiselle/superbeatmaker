import { watch } from 'fs';
import { join } from 'path';

let bundleCache: string | null = null;

async function bundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: ['./src/main.ts'],
    minify: false,
    sourcemap: 'inline',
  });

  if (!result.success) {
    console.error('Build failed:', result.logs);
    return '';
  }

  return await result.outputs[0].text();
}

// Initial bundle
bundleCache = await bundle();

// Watch for changes
watch('./src', { recursive: true }, async (event, filename) => {
  console.log(`File changed: ${filename}, rebuilding...`);
  bundleCache = await bundle();
});

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    if (path === '/') {
      path = '/index.html';
    }

    // Serve bundled JS
    if (path === '/main.ts' || path === '/main.js') {
      return new Response(bundleCache, {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }

    // Serve static files from src
    const filePath = `./src${path}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const contentType = getContentType(path);
      return new Response(file, {
        headers: { 'Content-Type': contentType },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

console.log(`Dev server running at http://localhost:${server.port}`);
