import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db';

const baseURL = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;

if (!secret || secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be configured with at least 32 characters.');
}

if (!baseURL) throw new Error('BETTER_AUTH_URL must be configured.');

export const auth = betterAuth({
  appName: 'NexPOS',
  baseURL,
  secret,
  database: drizzleAdapter(getDb(), { provider: 'pg' }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  socialProviders: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},
  trustedOrigins: baseURL ? [baseURL] : [],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'nexpos',
  },
});
