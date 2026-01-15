import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import security from 'eslint-plugin-security'

/**
 * ESLint configuration for the backend Express server.
 * Uses TypeScript ESLint and security plugin for Node.js best practices.
 * @type {import('typescript-eslint').Config}
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'security/detect-object-injection': ['off'],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
)
