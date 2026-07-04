module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // Baseline floor locked just below current measured coverage so CI
  // (`npm run test:cov`) ratchets against regressions without failing today.
  // Raise these as coverage improves.
  coverageThreshold: {
    global: {
      statements: 45,
      branches: 40,
      functions: 30,
      lines: 45,
    },
  },
};
