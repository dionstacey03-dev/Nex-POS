import React, { useMemo, useState } from 'react';
import { Receipt, RotateCcw, Search } from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { formatCurrency } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

export const SalesHistoryView: React.FC = () => {
  const { activeBusiness, sales, can, refundSale, setViewingReceipt } = useNexPos();
  const currency = activeBusiness?.currency ?? 'LKR';
  const canRefund = can('refund_sales');

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'card' | 'other'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refunded'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (methodFilter !== 'all' && s.paymentMethod !== methodFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (q) {
        return (
          s.receiptNumber.toLowerCase().includes(q) ||
          (s.customerName && s.customerName.toLowerCase().includes(q)) ||
          s.cashierName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sales, search, methodFilter, statusFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Sales History
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Audit completed POS transactions, inspect itemized receipts, and process manager refunds.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by receipt number, customer, or cashier..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="all">All Payments</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No matching sales records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Receipt</th>
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Cashier</th>
                  <th className="py-3 px-4 font-medium">Method</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {sale.receiptNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(sale.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {sale.customerName || 'Walk-in Customer'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {sale.cashierName}
                    </td>
                    <td className="py-3 px-4 uppercase text-slate-600 dark:text-slate-300">
                      {sale.paymentMethod}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          sale.status === 'completed'
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-amber-700 dark:text-amber-400 font-semibold'
                        }
                      >
                        {sale.status === 'completed' ? 'Completed' : 'Refunded'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(sale.grandTotal, currency)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.light();
                            setViewingReceipt(sale);
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" /> Receipt
                        </button>
                        {canRefund && sale.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => {
                              haptics.warning();
                              void refundSale(sale.id);
                            }}
                            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Refund
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
    </div>
  );
};
