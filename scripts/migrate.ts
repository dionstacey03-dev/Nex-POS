import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error('MIGRATION_DATABASE_URL is required. Use a dedicated migration-owner connection, not the runtime application role.');
}
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true') {
  throw new Error('Production migrations are disabled. Set ALLOW_PRODUCTION_MIGRATIONS=true only after explicit deployment approval.');
}

const pool = new Pool({ connectionString, max: 1 });
const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(here, '../db/migrations');

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  for (const name of files) {
    const existing = await pool.query('SELECT name FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(directory, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      process.stdout.write('Applied ' + name + '\n');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
