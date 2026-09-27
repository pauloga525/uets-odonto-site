const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.AUTH_DEV_LOGIN = 'true';
process.env.ALLOWED_DOMAINS = 'uets.edu.ec';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@uets.edu.ec';
process.env.BOOTSTRAP_DOCTOR_EMAIL = 'doctor@uets.edu.ec';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL.replace(/\/odonto(\?|$)/, '/odonto_test$1');
