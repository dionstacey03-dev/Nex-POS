import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL || window.location.origin,
  fetchOptions: {
    credentials: 'include',
  },
});

type V2SessionState = {
  data: { user: { id: string; name: string; email: string } } | null;
  isPending: boolean;
};

export function useV2Session(): V2SessionState {
  return authClient.useSession() as unknown as V2SessionState;
}
