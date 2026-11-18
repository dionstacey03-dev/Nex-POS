import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../db';

export default async function health(_req: VercelRequest, res: VercelResponse) {
  try {
    await getPool().query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch {
    return res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
}
