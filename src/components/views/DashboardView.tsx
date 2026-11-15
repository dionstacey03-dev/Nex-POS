import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  DollarSign,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { ProductThumbnail } from '../common/ProductThumbnail';
import { DashboardAiRestockWidget } from '../common/DashboardAiRestockWidget';
import { haptics } from '../../utils/haptics';

export const DashboardView: React.FC = () => {
  const {
    activeBusiness,
    products,
    categories,
    sales,
    setActiveSection,
    setViewingReceipt,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const [chartRange, setChartRange] = useState<'7d' | '14d'>('7d');

  const metrics = useMemo(() => {
    const completed = sales.filter((s) => s.status === 'completed');
    const todayKey = new Date().toISOString().slice(0, 10);

    const todaySales = completed.filter((s) => s.createdAt.slice(0, 10) === todayKey);
    const todayRevenue = roundMoney(todaySales.reduce((acc, s) => acc + s.grandTotal, 0));
    const totalSalesRevenue = roundMoney(completed.reduce((acc, s) => acc + s.grandTotal, 0));
    const totalOrders = completed.length;

    const totalCost = completed.reduce(
      (acc, s) => acc + s.items.reduce((iSum, item) => iSum + item.costPrice * item.quantity, 0),
      0
    );
    const totalTax = completed.reduce((acc, s) => acc + s.taxAmount, 0);
    const grossProfit = roundMoney(totalSalesRevenue - totalTax - totalCost);

    const lowStockProducts = products
      .filter((p) => p.active && p.stockQuantity <= p.minStockLevel)
      .sort((a, b) => a.stockQuantity - b.stockQuantity);

    // Top-selling products
    const productStats = new Map<
      string,
      { productId: string; name: string; sku: string; units: number; revenue: number; imageUrl?: string }
    >();
    for (const s of completed) {
      for (const item of s.items) {
        const existing = productStats.get(item.productId);
        const prodMatch = products.find((p) => p.id === item.productId);
        if (existing) {
          existing.units += item.quantity;
          existing.revenue = roundMoney(existing.revenue + item.lineTotal);
        } else {
          productStats.set(item.productId, {
            productId: item.productId,
            name: item.name,
            sku: item.sku,
            units: item.quantity,
            revenue: roundMoney(item.lineTotal),
            imageUrl: prodMatch?.imageUrl,
          });
        }
      }
    }
    const topProducts = Array.from(productStats.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Daily series for Revenue & Orders charts
    const daysCount = chartRange === '7d' ? 7 : 14;
    const dailySeries: Array<{ dateKey: string; label: string; revenue: number; orders: number }> = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const daySales = completed.filter((s) => s.createdAt.slice(0, 10) === key);
      dailySeries.push({
        dateKey: key,
        label: dayLabel,
        revenue: roundMoney(daySales.reduce((sum, s) => sum + s.grandTotal, 0)),
        orders: daySales.length,
      });
    }

    // Category performance breakdown
    const catRevenue = new Map<string, number>();
    for (const s of completed) {
      for (const item of s.items) {
        const prod = products.find((p) => p.id === item.productId);
        const catId = prod?.categoryId ?? 'other';
        catRevenue.set(catId, roundMoney((catRevenue.get(catId) ?? 0) + item.lineTotal));
      }
    }
    const categoryPerf = categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color ?? '#2563EB',
        revenue: catRevenue.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      todayRevenue,
      todayOrdersCount: todaySales.length,
      totalSalesRevenue,
      totalOrders,
      grossProfit,
      lowStockProducts,
      topProducts,
      dailySeries,
      categoryPerf,
    };
  }, [sales, products, categories, chartRange]);

  const maxRev = Math.max(1, ...metrics.dailySeries.map((d) => d.revenue));
  const maxCatRev = Math.max(1, ...metrics.categoryPerf.map((c) => c.revenue));

  // SVG polyline geometry for revenue chart
  const svgW = 560;
  const svgH = 180;
  const padX = 16;
  const padY = 16;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padY * 2;

  const points = metrics.dailySeries.map((d, idx) => {
    const x =
      metrics.dailySeries.length === 1
        ? padX + plotW / 2
        : padX + (idx / (metrics.dailySeries.length - 1)) * plotW;
    const y = padY + plotH - (d.revenue / maxRev) * plotH;
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${svgH - padY} L ${points[0].x} ${svgH - padY} Z`
      : '';

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Executive Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {activeBusiness?.name} · Real-time store revenue, inventory health, and checkout velocity.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            haptics.medium();
            setActiveSection('pos');
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <CreditCard className="w-4 h-4" />
          Open POS Terminal
        </button>
      </div>

      {/* Low-Stock Alert Banner */}
      {metrics.lowStockProducts.length > 0 && (() => {
        const outOfStockCount = metrics.lowStockProducts.filter((p) => p.stockQuantity === 0).length;
        return (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3.5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                    Low-Stock Restock Alert
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums bg-amber-200/80 dark:bg-amber-500/25 text-amber-900 dark:text-amber-200">
                    {metrics.lowStockProducts.length} SKU{metrics.lowStockProducts.length === 1 ? '' : 's'}
                  </span>
                  {outOfStockCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-semibold tabular-nums bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300">
                      {outOfStockCount} out of stock
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5 truncate">
                  Minimum stock reached for:{' '}
                  {metrics.lowStockProducts
                    .slice(0, 3)
                    .map((p) => `${p.name} (${p.stockQuantity}/${p.minStockLevel})`)
                    .join(', ')}
                  {metrics.lowStockProducts.length > 3
                    ? `, +${metrics.lowStockProducts.length - 3} more`
                    : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.warning();
                setActiveSection('inventory');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Review &amp; Restock
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Revenue</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(metrics.todayRevenue, currency)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {metrics.todayOrdersCount} completed orders today
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(metrics.totalSalesRevenue, currency)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Completed transactions total
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Orders</span>
            <ShoppingCart className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {metrics.totalOrders}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Avg ticket{' '}
            {formatCurrency(
              metrics.totalOrders > 0 ? metrics.totalSalesRevenue / metrics.totalOrders : 0,
              currency
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Gross Profit</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(metrics.grossProfit, currency)}
          </div>
          <div className="mt-1.5 text-xs tabular-nums">
            {metrics.lowStockProducts.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  haptics.warning();
                  setActiveSection('inventory');
                }}
                className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {metrics.lowStockProducts.length} low-stock SKU alert
                {metrics.lowStockProducts.length === 1 ? '' : 's'}
              </button>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                0 low-stock SKU alerts
              </span>
            )}
          </div>
        </div>
      </div>

      {/* AI-Powered Restock Suggestions */}
      <DashboardAiRestockWidget />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Revenue Trajectory
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily gross sales volume across all registers
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setChartRange('7d');
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  chartRange === '7d'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setChartRange('14d');
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  chartRange === '14d'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                14 Days
              </button>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-48 overflow-visible"
              role="img"
              aria-label="Daily revenue chart"
            >
              <defs>
                <linearGradient id="nexposRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75, 1].map((step) => {
                const y = padY + plotH * (1 - step);
                return (
                  <line
                    key={step}
                    x1={padX}
                    y1={y}
                    x2={svgW - padX}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800"
                    strokeWidth="1"
                  />
                );
              })}

              {areaPath && <path d={areaPath} fill="url(#nexposRevGrad)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {points.map((pt) => (
                <g key={pt.dateKey}>
                  <circle cx={pt.x} cy={pt.y} r="3.5" fill="#2563EB" />
                  <title>{`${pt.label}: ${formatCurrency(pt.revenue, currency)} (${pt.orders} orders)`}</title>
                </g>
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-2 px-2">
            <span>{metrics.dailySeries[0]?.label}</span>
            <span>{metrics.dailySeries[Math.floor(metrics.dailySeries.length / 2)]?.label}</span>
            <span>{metrics.dailySeries[metrics.dailySeries.length - 1]?.label}</span>
          </div>
        </div>

        {/* Category Sales Performance */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Sales Performance by Category
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Revenue contribution across active categories
            </p>
          </div>

          <div className="space-y-4 my-5">
            {metrics.categoryPerf.length === 0 ? (
              <p className="text-xs text-slate-500">No category sales data yet.</p>
            ) : (
              metrics.categoryPerf.map((cat) => {
                const pct = Math.max(4, Math.round((cat.revenue / maxCatRev) * 100));
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {cat.name}
                      </span>
                      <span className="font-mono text-slate-900 dark:text-slate-100 tabular-nums shrink-0 ml-2">
                        {formatCurrency(cat.revenue, currency)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.light();
              setActiveSection('categories');
            }}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer self-start"
          >
            Manage categories <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Grid: Recent Transactions, Top Products, Low-Stock */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Recent Transactions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any receipt to inspect or print
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                setActiveSection('sales');
              }}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              View all sales
            </button>
          </div>

          {sales.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No transactions recorded yet. Complete a sale in the POS Terminal.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Receipt</th>
                    <th className="py-2.5 px-4 font-medium">Customer</th>
                    <th className="py-2.5 px-4 font-medium">Method</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Total</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sales.slice(0, 6).map((sale) => (
                    <tr
                      key={sale.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {sale.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {sale.customerName || 'Walk-in Customer'}
                      </td>
                      <td className="py-3 px-4 uppercase text-slate-600 dark:text-slate-400">
                        {sale.paymentMethod}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={
                            sale.status === 'completed'
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-amber-700 dark:text-amber-400 font-medium'
                          }
                        >
                          {sale.status === 'completed' ? 'Completed' : 'Refunded'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(sale.grandTotal, currency)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.light();
                            setViewingReceipt(sale);
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Low Stock + Top Sellers */}
        <div className="space-y-6">
          {/* Low-Stock Alerts */}
          <div
            className={`rounded-xl border bg-white dark:bg-slate-900 p-5 transition-colors ${
              metrics.lowStockProducts.length > 0
                ? 'border-amber-300 dark:border-amber-500/40'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-4 h-4 ${
                    metrics.lowStockProducts.length > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-400'
                  }`}
                />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Low-Stock Products
                </h2>
                {metrics.lowStockProducts.length > 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                    {metrics.lowStockProducts.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (metrics.lowStockProducts.length > 0) {
                    haptics.warning();
                  } else {
                    haptics.light();
                  }
                  setActiveSection('inventory');
                }}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Restock
              </button>
            </div>

            {metrics.lowStockProducts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                All active SKUs are above minimum thresholds.
              </p>
            ) : (
              <>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {metrics.lowStockProducts.slice(0, 4).map((p) => {
                    const threshold = Math.max(1, p.minStockLevel);
                    const pct = Math.min(100, Math.max(0, Math.round((p.stockQuantity / threshold) * 100)));
                    const isOut = p.stockQuantity === 0;
                    return (
                      <div key={p.id} className="py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {p.sku} · Min {p.minStockLevel}
                            </div>
                          </div>
                          <div
                            className={`text-xs font-mono font-semibold tabular-nums shrink-0 ${
                              isOut
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {isOut ? 'Out of stock' : `${p.stockQuantity} left`}
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOut ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${isOut ? 100 : Math.max(8, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {metrics.lowStockProducts.length > 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.warning();
                      setActiveSection('inventory');
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 text-xs font-medium text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
                  >
                    View all {metrics.lowStockProducts.length} low-stock alerts
                  </button>
                )}
              </>
            )}
          </div>

          {/* Top-Selling Products */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Top-Selling Products
            </h2>
            {metrics.topProducts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sales velocity will appear after your first checkout.
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.topProducts.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3">
                    <ProductThumbnail
                      src={item.imageUrl}
                      alt={item.name}
                      size="sm"
                      className="w-10 h-10 rounded-lg shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {item.units} units sold
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                      {formatCurrency(item.revenue, currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
