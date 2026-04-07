/**
 * 数据库 Migration 执行器
 *
 * 在应用启动时自动执行 pending migrations。
 * 也可以通过 `npx tsx lib/server/db/migrate.ts` 手动运行。
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './index';
import path from 'path';

export function runMigrations() {
  const db = getDb();
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
}

if (require.main === module || process.argv[1]?.endsWith('migrate.ts')) {
  console.log('[migrate] Running database migrations...');
  runMigrations();
  console.log('[migrate] Done.');
}
