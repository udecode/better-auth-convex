import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema.ts'],
  target: 'esnext',
  tsconfig: './tooling/tsconfig.build.json',
  exports: true,
});
