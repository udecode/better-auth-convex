import eslintPluginUnicorn from 'eslint-plugin-unicorn';

import { defineConfig } from '../utils.js';

export default defineConfig(eslintPluginUnicorn.configs['flat/recommended'], {
  // plugins: {
  // 			unicorn: eslintPluginUnicorn,
  // 		},
  rules: {
    'unicorn/consistent-destructuring': 'off',
    'unicorn/consistent-function-scoping': [
      'error',
      {
        checkArrowFunctions: false,
      },
    ],
    'unicorn/expiring-todo-comments': 'off',
    'unicorn/filename-case': 'off',
    'unicorn/import-style': 'off',
    'unicorn/no-abusive-eslint-disable': 'off',
    'unicorn/no-array-callback-reference': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-array-push-push': 'off',
    'unicorn/no-array-reduce': 'off',
    'unicorn/no-await-expression-member': 'off',
    'unicorn/no-document-cookie': 'off',
    'unicorn/no-unreadable-array-destructuring': 'off',
    'unicorn/no-useless-undefined': 'off',
    // TypeScript doesn't like the for-of loop this rule fixes to
    'unicorn/no-for-loop': 'off',
    'unicorn/no-nested-ternary': 'off',
    'unicorn/no-null': 'off',
    'unicorn/prefer-export-from': 'off',
    'unicorn/prefer-global-this': 'off',
    'unicorn/prefer-logical-operator-over-ternary': 'off',
    'unicorn/prefer-module': 'off',
    // Spread syntax causes non-deterministic type errors
    'unicorn/prefer-spread': 'off',
    'unicorn/prefer-ternary': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/prevent-abbreviations': 'off',
  },
});
