import React, { useState } from 'react';
import { Edit3, Plus, ShieldCheck, UserCheck, X } from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { Employee, ROLE_LABELS, UserRole } from '../../types/nexpos';
import { generateId } from '../../services/posRepository';
import { haptics } from '../../utils/haptics';

export const EmployeesView: React.FC = () => {
  const { employees, can, saveEmployee } = useNexPos();
  const canManage = can('manage_employees');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [uid, setUid] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);

  if (!canManage) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-semibold">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          Only Owners and Administrators can manage staff roles and permissions.
        </p>
      </div>
    );
  }

  const openCreate = () => {
    haptics.light();
    setEditing(null);
    setUid(generateId('emp'));
    setName('');
    setEmail('');
    setRole('cashier');
    setStatus('active');
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    haptics.light();
    setEditing(emp);
    setUid(emp.uid);
    setName(emp.name);
    setEmail(emp.email);
    setRole(emp.role);
    setStatus(emp.status);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      haptics.warning();
      return;
    }
    setSaving(true);
    try {
      await saveEmployee({
        uid: uid.trim(),
        name: name.trim(),
        email: email.trim(),
        role,
        status,
      });
      haptics.success();
      setModalOpen(false);
    } catch {
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Employees & Permissions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Assign Owner, Administrator, Manager, and Cashier roles with enforced access boundaries.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      {/* Staff Directory */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 px-4 font-medium">Staff Member</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employees.map((emp) => (
                <tr key={emp.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{emp.name}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{emp.email}</td>
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                    {ROLE_LABELS[emp.role]}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        emp.status === 'active'
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-slate-400 font-medium'
                      }
                    >
                      {emp.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(emp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 cursor-pointer"
                      aria-label={`Edit ${emp.name}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Permissions Matrix */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Role-Based Access Matrix
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Owner</div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Full workspace control: business settings, tax & currency, employee roles, product deletion, reports, and POS.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Administrator</div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Manage staff directory, business settings, suppliers, catalog, inventory, refunds, and financial reports.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Manager</div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Manage products, categories, stock adjustments, suppliers, purchase orders, refunds, and sales analytics.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Cashier</div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              POS checkout, customer assignment, and receipt printing. Blocked from settings, staff management, and deletions.
            </p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit Employee' : 'Add Employee'}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold">
                {editing ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setModalOpen(false);
                }}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {!editing && (
                <div>
                  <label className="block text-xs font-medium mb-1">
                    User ID (Firebase Auth UID for Cloud Sync)
                  </label>
                  <input
                    type="text"
                    required
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-xs font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Administrator</option>
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
