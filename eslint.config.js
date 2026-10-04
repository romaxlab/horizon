import js from '@eslint/js'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

/** Modules and packages are used through their public `index.ts` only (AGENTS.md). */
const PUBLIC_API_ONLY = [
  {
    regex: '^@/modules/[^/]+/',
    message: "Import from the module's public API ('@/modules/<name>').",
  },
  {
    regex: '^@horizon/[^/]+/',
    message: "Import from the package's public API ('@horizon/<name>').",
  },
]

/** Layering: app → modules → shared. Lower layers never import upper ones. */
const NO_APP_IMPORTS = {
  regex: '^@/app(/|$)',
  message: 'Modules and shared code never depend on the app layer (composition root).',
}
const NO_MODULE_IMPORTS = {
  regex: '^@/modules(/|$)',
  message: 'Shared code never depends on feature modules.',
}

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
      'no-restricted-imports': ['error', { patterns: PUBLIC_API_ONLY }],
    },
  },
  {
    files: ['apps/control-center/src/modules/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...PUBLIC_API_ONLY, NO_APP_IMPORTS] }],
    },
  },
  {
    files: ['apps/control-center/src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...PUBLIC_API_ONLY, NO_APP_IMPORTS, NO_MODULE_IMPORTS] },
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
