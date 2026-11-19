import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as authSchema from './schema/auth';

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof authSchema>> | undefined;

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');

  // Fail closed if the runtime URL points at a different role than the dedicated
  // least-privilege role verified by the migration script. This prevents an
  // accidentally reused Neon owner URL from silently bypassing table RLS.
  const expectedRole = process.env.APP_DB_ROLE;
  if (!expectedRole) throw new Error('APP_DB_ROLE is not configured.');
  let actualRole: string;
  try {
    actualRole = decodeURIComponent(new URL(connectionString).username);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (actualRole !== expectedRole) {
    throw new Error('DATABASE_URL must authenticate as APP_DB_ROLE. Use the dedicated non-owner, non-BYPASSRLS runtime role.');
  }

  pool ??= new Pool({ connectionString, max: 5 });
  return pool;
}

export function getDb() {
  database ??= drizzle({ client: getPool(), schema: authSchema });
  return database;
}
