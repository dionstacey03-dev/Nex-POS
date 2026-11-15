import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

type Period = 'daily' | 'weekly' | 'monthly';

export const ReportsView: React.FC = () => {
  const { activeBusiness, sales } = useNexPos();
  const currency = activeBusiness?.currency ?? 'LKR';
  const [period, setPeriod] = useState<Period>('weekly');

  const analytics = useMemo(() => {
    const now = new Date();
    const daysWindow = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (daysWindow - 1));
    cutoff.setHours(0, 0, 0, 0);

    const periodSales = sales.filter(
      (s) => s.status === 'completed' && new Date(s.createdAt) >= cutoff
    );

    const grossRevenue = roundMoney(periodSales.reduce((sum, s) => sum + s.grandTotal, 0));
    const totalTax = roundMoney(periodSales.reduce((sum, s) => sum + s.taxAmount, 0));
    const totalDiscounts = roundMoney(periodSales.reduce((sum, s) => sum + s.discountAmount, 0));
    const totalCost = roundMoney(
      periodSales.reduce(
        (sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.costPrice * i.quantity, 0),
        0
      )
    );
    const netProfit = roundMoney(grossRevenue - totalTax - totalCost);

    const byPayment = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      other: { count: 0, total: 0 },
    };
    for (const s of periodSales) {
      byPayment[s.paymentMethod].count += 1;
      byPayment[s.paymentMethod].total = roundMoney(byPayment[s.paymentMethod].total + s.grandTotal);
    }

    // Product Performance
    const prodMap = new Map<
      string,
      { productId: string; name: string; sku: string; units: number; revenue: number; profit: number }
    >();
    for (const s of periodSales) {
      for (const item of s.items) {
        const profit = roundMoney((item.unitPrice - item.costPrice) * item.quantity);
        const existing = prodMap.get(item.productId);
        if (existing) {
          existing.units += item.quantity;
          existing.revenue = roundMoney(existing.revenue + item.lineTotal);
          existing.profit = roundMoney(existing.profit + profit);
        } else {
          prodMap.set(item.productId, {
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            units: item.quantity,
            revenue: roundMoney(item.lineTotal),
            profit,
          });
        }
      }
    }

    const productPerformance = Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Chart buckets
    const buckets: Array<{ label: string; revenue: number }> = [];
    const bucketDays = period === 'daily' ? 1 : period === 'weekly' ? 7 : 10;
    const stepDays = period === 'monthly' ? 3 : 1;
    for (let i = bucketDays - 1; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(end.getDate() - i * stepDays);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - (stepDays - 1));
      start.setHours(0, 0, 0, 0);

      const bucketTotal = periodSales
        .filter((s) => {
          const dt = new Date(s.createdAt);
          return dt >= start && dt <= end;
        })
        .reduce((sum, s) => sum + s.grandTotal, 0);

      buckets.push({
        label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        revenue: roundMoney(bucketTotal),
      });
    }

    return {
      periodSales,
      grossRevenue,
      totalTax,
      totalDiscounts,
      netProfit,
      byPayment,
      productPerformance,
      buckets,
    };
  }, [sales, period]);

  const exportCsv = () => {
    const header = ['Receipt', 'Date', 'Customer', 'Cashier', 'Method', 'Subtotal', 'Discount', 'Tax', 'Grand Total'];
    const rows = analytics.periodSales.map((s) => [
      s.receiptNumber,
      s.createdAt,
      s.customerName || 'Walk-in',
      s.cashierName,
      s.paymentMethod,
      s.subtotal,
      s.discountAmount,
      s.taxAmount,
      s.grandTotal,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexpos-${period}-sales-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    haptics.success();
  };

  const maxBucket = Math.max(1, ...analytics.buckets.map((b) => b.revenue));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Reports & Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Daily, weekly, and monthly revenue, payment method splits, and SKU profitability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setPeriod(p);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  period === p
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Gross Revenue</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatCurrency(analytics.grossRevenue, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {analytics.periodSales.length} completed orders
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Estimated Gross Profit</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(analytics.netProfit, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Revenue ex-tax minus COGS</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Tax Collected</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatCurrency(analytics.totalTax, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Configured rate: {activeBusiness?.taxRate ?? 0}%
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Discounts Given</div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatCurrency(analytics.totalDiscounts, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">POS order-level reductions</div>
        </div>
      </div>

      {/* Revenue Bar Chart + Payment Method Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-semibold mb-4">Revenue Distribution ({period})</h2>
          <div className="h-52 flex items-end gap-2 pt-4">
            {analytics.buckets.map((b, idx) => {
              const heightPct = Math.max(4, Math.round((b.revenue / maxBucket) * 100));
              return (
                <div key={`${b.label}-${idx}`} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div
                    className="w-full max-w-[44px] rounded-t-lg bg-blue-600/90 hover:bg-blue-600 transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${b.label}: ${formatCurrency(b.revenue, currency)}`}
                  />
                  <span className="text-[10px] font-mono text-slate-500 truncate max-w-full">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="text-sm font-semibold">Payment Method Breakdown</h2>
          {(['cash', 'card', 'other'] as const).map((method) => {
            const info = analytics.byPayment[method];
            const pct =
              analytics.grossRevenue > 0
                ? Math.round((info.total / analytics.grossRevenue) * 100)
                : 0;
            return (
              <div key={method} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="uppercase font-semibold text-slate-700 dark:text-slate-300">
                    {method} ({info.count})
                  </span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatCurrency(info.total, currency)} · {pct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product Performance Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Product Performance</h2>
        </div>
        {analytics.productPerformance.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No completed product sales in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Product</th>
                  <th className="py-2.5 px-4 font-medium">SKU</th>
                  <th className="py-2.5 px-4 font-medium text-right">Units Sold</th>
                  <th className="py-2.5 px-4 font-medium text-right">Gross Revenue</th>
                  <th className="py-2.5 px-4 font-medium text-right">Margin Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.productPerformance.map((p) => (
                  <tr key={p.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {p.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{p.sku}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{p.units}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                      {formatCurrency(p.revenue, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatCurrency(p.profit, currency)}
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
