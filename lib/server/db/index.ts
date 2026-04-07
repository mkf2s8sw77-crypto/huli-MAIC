/**
 * 服务端 SQLite 数据库连接（Drizzle ORM + better-sqlite3）
 *
 * 单例模式：整个 Node 进程共享一个连接。
 * 数据库文件路径通过 DATABASE_URL 环境变量配置，默认 ./data/maic.db。
 *
 * 注意：此文件只在服务端使用，不要从客户端代码引入。
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

function getDatabasePath(): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/^file:/, '');
  }
  return path.join(process.cwd(), 'data', 'maic.db');
}

function createDb() {
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

// 进程级单例
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type AppDatabase = ReturnType<typeof getDb>;
export { schema };
