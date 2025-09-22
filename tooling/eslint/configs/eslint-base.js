import js from '@eslint/js';

import { defineConfig } from '../utils.js';
import perfectionistConfig from './eslint-perfectionist.js';
import unicornConfig from './eslint-unicorn.js';

export default defineConfig(
  {
    ignores: [
      '.next',
      '.vercel',
      '.astro',
      '.source',
      'dist',
      '.tsup',
      `**/node_modules`,
      '.cache',
      '**/.cache',
      '**/build',
      '**/dist',
      '**/bundled',
      '**/vault',
      '**/_vault',
      '**/__*',
      '**/*.mdx',
      'tooling/scripts/**/*',
      '**/*demo',
      '.changeset',
    ],
  },

  // ─── JavaScript ───────────────────────────────────────────────────────

  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
  },
  {
    // List of rules to use
    rules: {
      'linebreak-style': ['error', 'unix'],
      'no-case-declarations': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-empty-function': 'off',
      'no-prototype-builtins': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*/_generated/server'],
              importNames: ['mutation', 'internalMutation'],
              message: 'Use functions.ts for mutation',
            },
          ],
        },
      ],
    },
  },
  // Formatting
  {
    rules: {
      'arrow-body-style': 'off',
      'lines-around-directive': ['warn', 'always'],
      'padding-line-between-statements': [
        'warn',
        { blankLine: 'never', next: 'case', prev: '*' },
        { blankLine: 'always', next: 'break', prev: '*' },
        { blankLine: 'always', next: 'class', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'class' },
        { blankLine: 'always', next: 'continue', prev: '*' },
        { blankLine: 'always', next: 'do', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'do' },
        { blankLine: 'always', next: 'export', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'export' },
        { blankLine: 'always', next: 'for', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'for' },
        { blankLine: 'always', next: 'function', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'function' },
        { blankLine: 'always', next: 'if', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'if' },
        { blankLine: 'never', next: 'if', prev: 'if' },
        { blankLine: 'always', next: 'return', prev: '*' },
        { blankLine: 'always', next: 'switch', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'switch' },
        { blankLine: 'always', next: 'throw', prev: '*' },
        { blankLine: 'always', next: 'try', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'try' },
        { blankLine: 'always', next: 'while', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'while' },
      ],
      'prefer-arrow-callback': 'off',
      'spaced-comment': [
        'error',
        'always',
        {
          block: {
            balanced: true,
            exceptions: ['*'],
            markers: ['!'],
          },
          line: {
            exceptions: ['-', '+'],
            markers: ['/'],
          },
        },
      ],
    },
  },

  // ─── Test ────────────────────────────────────────────────────────────

  // ...vitestConfig,

  // ─── Perfectionist / Unicorn ─────────────────────────────────────────

  ...unicornConfig,
  ...perfectionistConfig

  // ─── Tailwind (disabled, not yet compatible) ─────────────────────────

  // ...fixupConfigRules(compat.extends('plugin:tailwindcss/recommended')),
  // {
  // settings: {
  //   tailwindcss: {
  //     callees: ['classnames', 'clsx', 'ctl', 'cn', 'cva'],
  //   },
  // },
  // },
);
