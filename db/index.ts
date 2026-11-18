import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as authSchema from './schema/auth';

let pool: Pool | undefined;
let database: ReturnType<typeof drizzle<typeof authSchema>> | undefined;

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export function getDb() {
  database ??= drizzle({ client: getPool(), schema: authSchema });
  return database;
}
