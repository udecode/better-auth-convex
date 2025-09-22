/* eslint-disable unicorn/no-useless-spread */
import tseslint from 'typescript-eslint';

import { defineConfig } from '../utils.js';

export default defineConfig(
  {
    files: ['**/*.ts', '**/*.tsx'],
  },

  // Base JS/TS configs
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    ignores: ['tooling/eslint/index.d.ts'],
    rules: {
      // When not using in default config
      ...{
        '@typescript-eslint/no-unsafe-enum-comparison': 'off',
        '@typescript-eslint/prefer-for-of': 'off',
        '@typescript-eslint/prefer-optional-chain': 'off',
      },
      '@typescript-eslint/await-thenable': 'off',

      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      // Override recommended-type-checked
      ...{
        // '@typescript-eslint/ban-ts-comment': [
        //   'error',
        //   {
        //     minimumDescriptionLength: 10,
        //     'ts-check': false,
        //     'ts-expect-error': 'allow-with-description',
        //     'ts-ignore': true,
        //     'ts-nocheck': true,
        //   },
        // ],
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-empty-object-type': [
          'error',
          {
            allowInterfaces: 'always',
            allowObjectTypes: 'always',
          },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        // PERF: disable
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/only-throw-error': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
      // Override stylistic-type-checked
      ...{
        '@typescript-eslint/ban-tslint-comment': ['error'],
        '@typescript-eslint/consistent-generic-constructors': 'error',
        '@typescript-eslint/consistent-indexed-object-style': 'error',
        '@typescript-eslint/consistent-type-definitions': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
        '@typescript-eslint/non-nullable-type-assertion-style': 'off',
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
      },
      // Override strict-type-checked
      ...{
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
      // for now we can use both type and interface
      '@typescript-eslint/consistent-type-exports': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  {
    files: ['*.mjs'],
    rules: {
      '@typescript-eslint/consistent-type-exports': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/naming-convention': 'off',
    },
  }
);
