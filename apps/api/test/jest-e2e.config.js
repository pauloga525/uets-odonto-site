/** Pruebas de integración contra PostgreSQL real (base odonto_test). */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/global-setup.js',
  setupFiles: ['<rootDir>/env.js'],
  testTimeout: 60000,
};
