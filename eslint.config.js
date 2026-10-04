import js from '@eslint/js'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default defineConfigWithVueTs(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  },
  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Modules and packages are used through their public `index.ts` only (AGENTS.md).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/modules/[^/]+/',
              message: "Import from the module's public API ('@/modules/<name>').",
            },
            {
              regex: '^@horizon/[^/]+/',
              message: "Import from the package's public API ('@horizon/<name>').",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      // Optional props without defaults are valid with typed `defineProps`.
      'vue/require-default-prop': 'off',
      // Misreports reactive props destructure defaults as useless.
      '@typescript-eslint/no-useless-default-assignment': 'off',
      // Treats `generic="T extends string"` parameters as their constraint and strips them.
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [vueTsConfigs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  skipFormatting,
)
