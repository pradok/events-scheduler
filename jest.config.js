/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/domain/schemas/**/*.ts', // Schemas are for type derivation, no runtime logic to test
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'src/domain/**/*.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  moduleFileExtensions: ['ts', 'js'],
  verbose: true,
  moduleNameMapper: {
    '^@modules/user/(.*)$': '<rootDir>/src/modules/user/$1',
    '^@modules/event-scheduling/(.*)$': '<rootDir>/src/modules/event-scheduling/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
};
