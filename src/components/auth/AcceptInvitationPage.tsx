import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { acceptEmployeeInvitation } from '../../services/v2Api';

type Mode = 'sign-in' | 'sign-up';

function readInvitation() {
  const params = new URLSearchParams(window.location.search);
  return { businessId: params.get('businessId') ?? '', token: params.get('token') ?? '' };
}

export const AcceptInvitationPage: React.FC = () => {
  const invitation = readInvitation();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.user || !invitation.businessId || !invitation.token || accepted || busy) return;
    let cancelled = false;
    setBusy(true);
    acceptEmployeeInvitation(invitation.businessId, invitation.token)
      .then(() => { if (!cancelled) setAccepted(true); })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The invitation could not be accepted.');
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [session?.user, invitation.businessId, invitation.token, accepted]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || 'Authentication failed.');
      // Session state refreshes through Better Auth; the invitation is accepted by the effect above.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const validLink = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitation.businessId)
    && invitation.token.length >= 32 && invitation.token.length <= 128;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl p-7 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center text-xl font-bold">N</div>
          <div><p className="font-bold text-lg">NexPOS</p><p className="text-xs text-slate-400">Business workspace invitation</p></div>
        </div>

        {!validLink ? (
          <div className="rounded-xl border border-rose-900/70 bg-rose-950/30 p-4 text-sm text-rose-200">
            This invitation link is incomplete or invalid. Ask the business owner or administrator for a new invitation.
          </div>
        ) : accepted ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h1 className="text-xl font-semibold">Invitation accepted</h1>
            <p className="text-sm text-slate-300">Your account has been added to the business workspace. You can now sign in to NexPOS.</p>
            <a href="/" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">Continue to NexPOS <ArrowRight className="h-4 w-4" /></a>
          </div>
        ) : isPending || busy && session?.user ? (
          <div className="py-8 text-center space-y-3"><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-blue-400" /><p className="text-sm text-slate-300">Verifying your invitation…</p></div>
        ) : session?.user ? (
          <div className="space-y-3"><h1 className="text-xl font-semibold">Accepting invitation</h1><p className="text-sm text-slate-300">Signed in as {session.user.email}. Your invitation is being checked.</p>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button onClick={() => authClient.signOut({})} className="text-sm text-blue-300 hover:text-blue-200">Use a different account</button></div>
        ) : (
          <>
            <div><h1 className="text-xl font-semibold">You’re invited to NexPOS</h1><p className="mt-1 text-sm text-slate-400">Sign in with the invited email address, or create an account using that email to join the workspace.</p></div>
            <div className="grid grid-cols-2 rounded-xl bg-slate-950 p-1 text-sm">
              <button type="button" onClick={() => setMode('sign-in')} className={`rounded-lg py-2 ${mode === 'sign-in' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Sign in</button>
              <button type="button" onClick={() => setMode('sign-up')} className={`rounded-lg py-2 ${mode === 'sign-up' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Create account</button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'sign-up' && <label className="block text-xs text-slate-300">Full name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>}
              <label className="block text-xs text-slate-300"><Mail className="inline h-3.5 w-3.5 mr-1" />Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>
              <label className="block text-xs text-slate-300"><LockKeyhole className="inline h-3.5 w-3.5 mr-1" />Password<input required type="password" minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500" /></label>
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              <button disabled={busy} type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{mode === 'sign-up' ? 'Create account and continue' : 'Sign in and continue'}</button>
            </form>
            <p className="text-[11px] leading-relaxed text-slate-500">The invitation can only be accepted by an account with the email address it was issued to. Links expire after seven days and can only be used once.</p>
          </>
        )}
      </section>
    </main>
  );
};
