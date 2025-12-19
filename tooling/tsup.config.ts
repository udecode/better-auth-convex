import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  external: [
    'better-auth',
    'convex',
    '@convex-dev/better-auth',
    'convex-helpers',
  ],
  format: ['cjs', 'esm'],
  minify: false,
  outDir: 'dist',
  sourcemap: true,
  target: 'esnext',
  treeshake: true,
});
