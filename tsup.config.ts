import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  external: [],
  format: ['esm'],
  minify: false,
  outDir: 'dist',
  sourcemap: true,
  target: 'esnext',
  treeshake: true,
});
