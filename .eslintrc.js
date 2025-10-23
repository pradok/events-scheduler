module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Forbid console.log in src/ directory (except test files)
    'no-console': ['error', { allow: ['warn', 'error'] }],

    // Forbid any type
    '@typescript-eslint/no-explicit-any': 'error',

    // Enforce explicit function return types
    '@typescript-eslint/explicit-function-return-type': [
      'warn',
      {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      },
    ],

    // Enforce explicit member accessibility
    '@typescript-eslint/explicit-member-accessibility': [
      'error',
      {
        accessibility: 'explicit',
      },
    ],

    // Prefer interfaces over type aliases for object types
    '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],

    // Disallow unused variables
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    // Require await in async functions
    '@typescript-eslint/require-await': 'error',

    // Disallow floating promises
    '@typescript-eslint/no-floating-promises': 'error',

    // Enforce consistent naming conventions
    '@typescript-eslint/naming-convention': [
      'warn',
      {
        selector: 'interface',
        format: ['PascalCase'],
        // Note: Project uses both I-prefixed (ports) and non-prefixed interfaces
        // Both patterns are acceptable for hexagonal architecture
      },
      {
        selector: 'class',
        format: ['PascalCase'],
      },
      {
        selector: 'variable',
        format: ['camelCase', 'UPPER_CASE'],
      },
      {
        // Allow PascalCase for Zod schemas (e.g., CreateUserSchema)
        selector: 'variable',
        filter: 'Schema$',
        format: ['PascalCase'],
      },
      {
        selector: 'function',
        format: ['camelCase'],
      },
    ],
  },
  overrides: [
    {
      // Relaxed rules for test files
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],
};
