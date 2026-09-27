import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Un único .env en la raíz del monorepo (en Docker las variables llegan por el entorno).
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
});
