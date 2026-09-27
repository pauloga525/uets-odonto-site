const { execSync } = require('node:child_process');
const path = require('node:path');

/** Aplica las migraciones a la base de pruebas antes de ejecutar la suite. */
module.exports = async () => {
  require('./env.js');
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};
