import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Receipt, Search, Users, X } from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { Customer } from '../../types/nexpos';
import { formatCurrency } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

export const CustomersView: React.FC = () => {
  const { activeBusiness, customers, sales, can, saveCustomer, setViewingReceipt } = useNexPos();
  const currency = activeBusiness?.currency ?? 'LKR';
  const canEdit = can('manage_products') || can('manage_customers');

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const customerSales = useMemo(() => {
    if (!historyCustomer) return [];
    return sales.filter((s) => s.customerId === historyCustomer.id);
  }, [sales, historyCustomer]);

  const openCreate = () => {
    haptics.light();
    setEditing(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    haptics.light();
    setEditing(c);
    setName(c.name);
    setPhone(c.phone ?? '');
    setEmail(c.email ?? '');
    setAddress(c.address ?? '');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      haptics.warning();
      return;
    }
    setSaving(true);
    try {
      await saveCustomer({
        id: editing?.id,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        totalSpent: editing?.totalSpent ?? 0,
        ordersCount: editing?.ordersCount ?? 0,
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Customers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {customers.length} customer profiles · Track contact records, lifetime spending, and purchase history.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, phone, or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold">No customers found</div>
            <p className="text-xs text-slate-500">
              Add a customer here or directly from the POS Terminal during checkout.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Phone</th>
                  <th className="py-3 px-4 font-medium">Email</th>
                  <th className="py-3 px-4 font-medium">Address</th>
                  <th className="py-3 px-4 font-medium text-right">Orders</th>
                  <th className="py-3 px-4 font-medium text-right">Total Spending</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {cust.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {cust.phone || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {cust.email || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">
                      {cust.address || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {cust.ordersCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(cust.totalSpent, currency)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.light();
                            setHistoryCustomer(cust);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                        >
                          History
                        </button>
                        {can('manage_products') && (
                          <button
                            type="button"
                            onClick={() => openEdit(cust)}
                            className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                            aria-label={`Edit ${cust.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit Customer' : 'Add Customer'}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold">
                {editing ? 'Edit Customer' : 'Add Customer'}
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
                <label className="block text-xs font-medium mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
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
                  {saving ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase History Drawer/Modal */}
      {historyCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Customer Purchase History"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold">{historyCustomer.name}</h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  {historyCustomer.ordersCount} orders · Lifetime spend{' '}
                  {formatCurrency(historyCustomer.totalSpent, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setHistoryCustomer(null);
                }}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              {customerSales.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">
                  No linked receipts found for this customer yet.
                </p>
              ) : (
                customerSales.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-mono font-semibold">{s.receiptNumber}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(s.createdAt).toLocaleString()} · {s.items.length} items
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold tabular-nums">
                        {formatCurrency(s.grandTotal, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.light();
                          setViewingReceipt(s);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" /> View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
