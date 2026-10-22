import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'out/**',
      'release/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/main/**', 'src/preload/**', 'tests/**', '*.config.{ts,mts,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // The sandboxed preload cannot load npm packages at runtime, so it and the IPC contract
    // it imports may use other modules for types only.
    files: ['src/preload/**/*.ts', 'src/shared/ipc.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['zod', '**/ipc-schemas', '**/settings'],
              allowTypeImports: true,
              message: 'Sandboxed preload code may only import these modules as types.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
);
