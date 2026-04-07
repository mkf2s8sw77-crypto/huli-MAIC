import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL?.trim() || 'file:./data/maic.db';

export default defineConfig({
  schema: './lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: databaseUrl.startsWith('file:') ? databaseUrl : `file:${databaseUrl}`,
  },
});
