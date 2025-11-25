import { defineConfig } from 'tsdown';

export default defineConfig({
  target: 'esnext',
  tsconfig: './tooling/tsconfig.build.json',
  exports: true,
  sourcemap: true,
  dts: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
});
