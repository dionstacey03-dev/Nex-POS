import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Edit3, LoaderCircle, MailPlus, ShieldCheck, UserCheck, Users, X } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import {
  createEmployeeInvitation,
  getBusinesses,
  getWorkspace,
  updateEmployee,
  type V2BusinessSummary,
} from '../../services/v2Api';
import { ROLE_LABELS, type UserRole } from '../../types/nexpos';
import { haptics } from '../../utils/haptics';

interface V2Employee {
  uid: string;
  businessId: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

type EditableRole = Exclude<UserRole, 'owner'>;

export const EmployeesView: React.FC = () => {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [businesses, setBusinesses] = useState<V2BusinessSummary[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [employees, setEmployees] = useState<V2Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EditableRole>('cashier');
  const [saving, setSaving] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [editing, setEditing] = useState<V2Employee | null>(null);
  const [editRole, setEditRole] = useState<EditableRole>('cashier');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [copied, setCopied] = useState(false);

  const activeBusiness = useMemo(
    () => businesses.find((business) => business.id === businessId) ?? null,
    [businesses, businessId],
  );
  const canManage = activeBusiness?.role === 'owner' || activeBusiness?.role === 'admin';
  const canAssignAdmin = activeBusiness?.role === 'owner';

  const loadWorkspace = useCallback(async (selectedBusinessId: string) => {
    if (!selectedBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const snapshot = await getWorkspace(selectedBusinessId);
      setEmployees((snapshot.employees ?? []) as V2Employee[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the staff directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    setLoading(true);
    getBusinesses()
      .then(({ businesses: result }) => {
        if (cancelled) return;
        setBusinesses(result);
        const preferred = result.find((business) => business.id === businessId) ?? result[0];
        setBusinessId(preferred?.id ?? '');
        if (!preferred) setEmployees([]);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load your businesses.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.user]);

  useEffect(() => {
    if (businessId) void loadWorkspace(businessId);
  }, [businessId, loadWorkspace]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !email.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    setInvitationUrl('');
    try {
      const result = await createEmployeeInvitation(businessId, { email: email.trim(), role });
      const url = new URL('/accept-invitation', window.location.origin);
      url.searchParams.set('businessId', businessId);
      url.searchParams.set('token', result.invitationToken);
      setInvitationUrl(url.toString());
      setNotice(`Invitation created for ${result.invitation.email}. Share the secure link directly with them.`);
      setEmail('');
      haptics.success();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitation could not be created.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !editing) return;
    setSaving(true);
    setError('');
    try {
      const result = await updateEmployee(businessId, editing.uid, { role: editRole, status: editStatus });
      setEmployees((current) => current.map((employee) =>
        employee.uid === editing.uid ? result.employee as V2Employee : employee,
      ));
      setEditing(null);
      setNotice('Staff permissions updated.');
      haptics.success();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Staff permissions could not be updated.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);
      setNotice('Invitation link copied. Share it only with the invited person.');
      haptics.success();
    } catch {
      setError('Could not copy the link. Select and copy it manually.');
    }
  };

  if (sessionPending) {
    return <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" />Checking V2 account…</div>;
  }

  if (!session?.user) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-blue-500" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">V2 staff management</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Staff invitations and permissions are managed through the V2 account. Sign in with your Better Auth account to continue.</p>
        <a href="/accept-invitation" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Open V2 account sign-in</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Employees & Permissions</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage V2 workspace memberships and invite staff securely by email.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Business workspace" value={businessId} onChange={(event) => setBusinessId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
          </select>
          <button type="button" disabled={!canManage || loading} onClick={() => { setInviteOpen(true); setInvitationUrl(''); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <MailPlus className="h-4 w-4" /> Invite staff
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}

      {!businesses.length && !loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <Users className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">No V2 business workspaces</h2>
          <p className="mt-1 text-sm text-slate-500">Your signed-in V2 account is not currently a member of a business workspace.</p>
        </div>
      ) : (
        <>
          {!canManage && activeBusiness && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">You have {ROLE_LABELS[activeBusiness.role]} access. Only owners and administrators can manage staff.</p>}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><Users className="h-4 w-4 text-blue-500" /> Staff directory</div>
              <span className="text-xs text-slate-500">{employees.length} members</span>
            </div>
            {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading staff…</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/60 dark:text-slate-400"><tr><th className="px-4 py-3 font-medium">Staff member</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employees.map((employee) => <tr key={employee.uid}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100"><span className="inline-flex items-center gap-2"><UserCheck className="h-4 w-4 text-blue-500" />{employee.name}</span></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{employee.email}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{ROLE_LABELS[employee.role]}</td>
                      <td className="px-4 py-3"><span className={employee.status === 'active' ? 'font-semibold text-emerald-600' : 'text-slate-400'}>{employee.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                      <td className="px-4 py-3 text-right"><button type="button" disabled={!canManage || employee.role === 'owner' || employee.uid === session.user.id} onClick={() => { setEditing(employee); setEditRole(employee.role === 'owner' ? 'cashier' : employee.role); setEditStatus(employee.status); }} className="rounded-lg p-2 text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Edit ${employee.name}`}><Edit3 className="h-4 w-4" /></button></td>
                    </tr>)}
                    {!employees.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No staff memberships found in this workspace.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Role permissions</h2>
        <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 xl:grid-cols-4">
          {(['owner', 'admin', 'manager', 'cashier'] as UserRole[]).map((item) => <div key={item} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="font-semibold text-slate-900 dark:text-slate-100">{ROLE_LABELS[item]}</div><p className="mt-1.5 leading-relaxed text-slate-500 dark:text-slate-400">{item === 'owner' ? 'Full business control, including administrator access and staff management.' : item === 'admin' ? 'Manage staff, settings, catalog, inventory, and business operations. Cannot manage the owner or other administrators.' : item === 'manager' ? 'Manage products, inventory, suppliers, purchasing, refunds, and sales analytics.' : 'Process POS sales and manage customer assignment.'}</p></div>)}
        </div>
      </div>

      {inviteOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Invite staff member">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Invite staff member</h2><button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button></div>
          {invitationUrl ? <div className="space-y-3"><p className="text-sm text-slate-600 dark:text-slate-300">Invitation created. Email delivery is not configured, so share this link directly and securely with the invited person. It expires in seven days and can be used once.</p><input readOnly value={invitationUrl} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /><button type="button" onClick={copyInvitation} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Copy className="h-4 w-4" />{copied ? 'Copied link' : 'Copy invitation link'}</button></div> : <form onSubmit={handleInvite} className="space-y-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Staff email<input required type="email" maxLength={160} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Workspace role<select value={role} onChange={(event) => setRole(event.target.value as EditableRole)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="cashier">Cashier</option><option value="manager">Manager</option>{canAssignAdmin && <option value="admin">Administrator</option>}</select></label>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Create invitation</button></div>
          </form>}
          {invitationUrl && <div className="flex justify-end"><button type="button" onClick={() => { setInviteOpen(false); setInvitationUrl(''); setCopied(false); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Done</button></div>}
        </div>
      </div>}

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit staff permissions">
        <form onSubmit={handleUpdate} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900 dark:text-slate-100">Edit staff access</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close" className="text-slate-400"><X className="h-4 w-4" /></button></div>
          <p className="text-sm text-slate-500">{editing.name} · {editing.email}</p>
          <label className="block text-xs font-medium">Role<select value={editRole} onChange={(event) => setEditRole(event.target.value as EditableRole)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="cashier">Cashier</option><option value="manager">Manager</option>{canAssignAdmin && <option value="admin">Administrator</option>}</select></label>
          <label className="block text-xs font-medium">Membership status<select value={editStatus} onChange={(event) => setEditStatus(event.target.value as 'active' | 'inactive')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </div>}
    </div>
  );
};
