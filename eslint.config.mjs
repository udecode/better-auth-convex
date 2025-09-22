import unusedImports from 'eslint-plugin-unused-imports';

import { configs, defineConfig } from './tooling/eslint/index.js';

export default defineConfig(
  {
    ignores: ['src/index.ts'],
  },
  ...configs.base,
  ...configs.typescript,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // No unused imports
      'unused-imports/no-unused-imports': 'error',
    },
  }
);
