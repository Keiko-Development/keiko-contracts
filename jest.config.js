module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'server.js',
    '!node_modules/**',
    '!coverage/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json',
    'text-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  collectCoverage: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  maxWorkers: 1, // Prevent port conflicts in integration tests
  // Separate configurations for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/tests/unit/**/*.test.js'],
      testPathIgnorePatterns: ['**/tests/integration/**'],
      testTimeout: 10000
    },
    {
      displayName: 'integration', 
      testMatch: ['**/tests/integration/**/*.test.js'],
      testTimeout: 60000,
      maxWorkers: 1,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    }
  ]
};
