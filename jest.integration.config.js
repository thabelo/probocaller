// Integration tests — boot a Nest TestingModule against a REAL Postgres DB.
// Kept separate from the default unit run (jest.config.js, rootDir 'src') so
// `npm test` stays DB-free and fast. Run with `npm run test:integration`
// (point at a disposable DB via INTEGRATION_DB_NAME).
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
