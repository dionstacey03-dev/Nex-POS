import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, LoaderCircle, LogIn, LogOut, Plus, Store } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { createBusiness, getBusinesses, getWorkspace, type V2BusinessSummary, type V2WorkspaceSnapshot } from '../../services/v2Api';
import type { BusinessType, CurrencyCode } from '../../types/nexpos';

export const V2WorkspacePage: React.FC = () => {
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  const [currency, setCurrency] = useState<CurrencyCode>('LKR');
  const [businesses, setBusinesses] = useState<V2BusinessSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState<V2WorkspaceSnapshot | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshBusinesses = async (preferredId?: string) => {
    const result = await getBusinesses();
    setBusinesses(result.businesses);
    const nextId = preferredId && result.businesses.some((item) => item.id === preferredId)
      ? preferredId
      : selectedId && result.businesses.some((item) => item.id === selectedId)
        ? selectedId
        : result.businesses[0]?.id ?? '';
    setSelectedId(nextId);
    return nextId;
  };

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    setBusy(true);
    setError('');
    getBusinesses()
      .then((result) => {
        if (cancelled) return;
        setBusinesses(result.businesses);
        setSelectedId((current) => result.businesses.some((item) => item.id === current) ? current : result.businesses[0]?.id ?? '');
        if (!result.businesses.length) setShowCreate(true);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load your workspaces.');
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [session?.user]);

  useEffect(() => {
    if (!selectedId || !session?.user) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError('');
    getWorkspace(selectedId)
      .then((result) => { if (!cancelled) setSnapshot(result); })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setSnapshot(null);
          setError(cause instanceof Error ? cause.message : 'Could not load the selected workspace.');
        }
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [selectedId, session?.user]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || 'Authentication failed.');
      setMessage('Account authenticated. Loading your V2 workspaces…');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessName.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await createBusiness({ name: businessName.trim(), businessType, currency, taxRate: 0, timezone: 'Asia/Colombo' });
      setBusinessName('');
      setShowCreate(false);
      await refreshBusinesses(result.business.id);
      setMessage('Your V2 business workspace has been created.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Business workspace could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold">N</div>
            <div><p className="text-xl font-bold tracking-tight">NexPOS V2</p><p className="text-xs text-slate-400">Better Auth · Neon PostgreSQL</p></div>
          </div>
          {session?.user && <div className="flex items-center gap-3"><div className="text-right"><p className="text-sm font-medium">{session.user.name}</p><p className="text-xs text-slate-400">{session.user.email}</p></div><button type="button" onClick={() => authClient.signOut({})} className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="Sign out"><LogOut className="h-4 w-4" /></button></div>}
        </header>

        {error && <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {message && <div role="status" className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{message}</div>}

        {isPending || busy && !session?.user ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-300"><LoaderCircle className="h-5 w-5 animate-spin" />Checking your V2 account…</div>
        ) : !session?.user ? (
          <section className="mx-auto mt-12 max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
            <div className="mb-6"><h1 className="text-xl font-semibold">{mode === 'sign-in' ? 'Sign in to NexPOS V2' : 'Create your NexPOS account'}</h1><p className="mt-1 text-sm text-slate-400">Use your V2 account to access business workspaces.</p></div>
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-950 p-1 text-sm"><button type="button" onClick={() => setMode('sign-in')} className={`rounded-lg py-2 ${mode === 'sign-in' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Sign in</button><button type="button" onClick={() => setMode('sign-up')} className={`rounded-lg py-2 ${mode === 'sign-up' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>Create account</button></div>
            <form onSubmit={submitAuth} className="space-y-4">
              {mode === 'sign-up' && <label className="block text-xs text-slate-300">Full name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>}
              <label className="block text-xs text-slate-300">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>
              <label className="block text-xs text-slate-300">Password<input required type="password" minLength={8} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label>
              <button disabled={busy} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}{mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
            </form>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">This V2 account is separate from the legacy Firebase demo/cloud sign-in.</p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">Your business workspaces</h1><p className="mt-1 text-sm text-slate-400">Choose a V2 business to load its Neon-backed workspace data.</p></div><div className="flex flex-wrap gap-2"><a href="/v2/data" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">Open V2 data <ArrowRight className="h-4 w-4" /></a><a href="/v2/employees" className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800">Manage staff <ArrowRight className="h-4 w-4" /></a></div></div>
              {businesses.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{businesses.map((business) => <button key={business.id} type="button" onClick={() => setSelectedId(business.id)} className={`rounded-2xl border p-4 text-left transition-colors ${selectedId === business.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}><div className="flex items-center justify-between"><Building2 className="h-5 w-5 text-blue-400" />{selectedId === business.id && <CheckCircle2 className="h-4 w-4 text-blue-400" />}</div><p className="mt-3 font-semibold">{business.name}</p><p className="mt-1 text-xs text-slate-400">{business.businessType} · {business.currency} · {business.role}</p></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center"><Store className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 font-medium">No business workspace yet</p><p className="mt-1 text-sm text-slate-400">Create a workspace to start using the V2 data model.</p></div>}
              {snapshot && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{snapshot.business.name}</h2><p className="text-xs text-slate-400">Workspace data loaded successfully</p></div><span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-300">Connected</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{label:'Products',count:snapshot.products.length},{label:'Customers',count:snapshot.customers.length},{label:'Suppliers',count:snapshot.suppliers.length},{label:'Employees',count:snapshot.employees.length},{label:'Categories',count:snapshot.categories.length},{label:'Sales',count:snapshot.sales.length},{label:'Locations',count:snapshot.locations.length},{label:'Purchase orders',count:snapshot.purchases.length}].map((item) => <div key={item.label} className="rounded-xl bg-slate-950 p-3"><p className="text-xl font-semibold tabular-nums">{item.count}</p><p className="mt-1 text-xs text-slate-400">{item.label}</p></div>)}</div></div>}
            </section>
            <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Create a workspace</h2><p className="mt-1 text-sm text-slate-400">Set up a new business under your V2 account.</p>{showCreate ? <form onSubmit={submitBusiness} className="mt-4 space-y-3"><label className="block text-xs text-slate-300">Business name<input required maxLength={120} value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label><label className="block text-xs text-slate-300">Business type<select value={businessType} onChange={(event) => setBusinessType(event.target.value as BusinessType)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="retail">Retail</option><option value="cafe">Cafe</option><option value="pharmacy">Pharmacy</option><option value="apparel">Apparel</option><option value="electronics">Electronics</option><option value="general">General</option></select></label><label className="block text-xs text-slate-300">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option value="LKR">LKR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AUD">AUD</option><option value="SGD">SGD</option><option value="INR">INR</option><option value="JPY">JPY</option><option value="AED">AED</option></select></label><div className="flex gap-2"><button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-slate-700 px-3 py-2.5 text-sm">Cancel</button><button disabled={busy} type="submit" className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create</button></div></form> : <button type="button" onClick={() => setShowCreate(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold hover:bg-slate-800"><Plus className="h-4 w-4" />New business workspace</button>}</aside>
          </div>
        )}
        <footer className="flex items-center justify-between border-t border-slate-800 pt-5 text-xs text-slate-500"><span>NexPOS V2 · Workspace bootstrap</span><a href="/accept-invitation" className="inline-flex items-center gap-1 hover:text-slate-300">Accept an invitation <ArrowRight className="h-3 w-3" /></a></footer>
      </div>
    </main>
  );
};
