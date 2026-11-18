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

const appRole = process.env.APP_DB_ROLE;
if (!appRole || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) {
  throw new Error('APP_DB_ROLE must name the dedicated runtime PostgreSQL role.');
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
  const roleCheck = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }>(
    `SELECT r.rolsuper,r.rolbypassrls,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner=r.oid
      ) AS owns_tables
     FROM pg_roles r WHERE r.rolname=$1`,
    [appRole],
  );
  const role = roleCheck.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_tables) {
    throw new Error('APP_DB_ROLE must exist and must not be superuser, BYPASSRLS, or owner of application tables.');
  }
  const quotedRole = '"' + appRole + '"';
  await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole}`);
  await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${quotedRole}`);
  await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${quotedRole}`);
  process.stdout.write('Verified runtime role ' + appRole + ' and granted application table privileges.\\n');
} finally {
  await pool.end();
}
