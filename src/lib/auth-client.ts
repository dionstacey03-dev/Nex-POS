import { createAuthClient } from 'better-auth/react';
import type { auth } from '../../auth';

export const authClient = createAuthClient<typeof auth>({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL || window.location.origin,
  fetchOptions: {
    credentials: 'include',
  },
});
