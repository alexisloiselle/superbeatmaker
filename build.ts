import { mkdir, copyFile } from 'fs/promises';

// Ensure dist directory exists
await mkdir('./dist', { recursive: true });

// Bundle JavaScript
const result = await Bun.build({
  entrypoints: ['./src/main.ts'],
  outdir: './dist',
  minify: true,
  sourcemap: 'external',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Copy static files
await copyFile('./src/index.html', './dist/index.html');
await copyFile('./src/styles.css', './dist/styles.css');

console.log('Build complete! Output in ./dist');
