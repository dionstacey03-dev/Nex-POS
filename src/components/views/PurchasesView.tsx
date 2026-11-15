import React, { useState } from 'react';
import { CheckCircle2, Plus, ShoppingBag, X } from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { PurchaseItem } from '../../types/nexpos';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

export const PurchasesView: React.FC = () => {
  const {
    activeBusiness,
    purchases,
    suppliers,
    products,
    locations,
    createPurchaseOrder,
    receivePurchaseOrder,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const [modalOpen, setModalOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [selectedProdId, setSelectedProdId] = useState('');
  const [qty, setQty] = useState('10');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openCreateModal = () => {
    haptics.light();
    setSupplierId(suppliers[0]?.id ?? '');
    setLocationId(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? '');
    setSelectedProdId(products[0]?.id ?? '');
    setQty('10');
    setItems([]);
    setModalOpen(true);
  };

  const addLineItem = () => {
    const prod = products.find((p) => p.id === selectedProdId);
    const count = Math.max(1, Math.floor(Number(qty) || 1));
    if (!prod) {
      haptics.warning();
      return;
    }
    haptics.light();
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === prod.id
            ? {
                ...i,
                quantity: i.quantity + count,
                lineTotal: roundMoney((i.quantity + count) * i.unitCost),
              }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          quantity: count,
          unitCost: prod.purchasePrice,
          lineTotal: roundMoney(count * prod.purchasePrice),
        },
      ];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup || items.length === 0) {
      haptics.warning();
      return;
    }
    setSubmitting(true);
    try {
      await createPurchaseOrder({
        supplierId: sup.id,
        supplierName: sup.companyName,
        locationId: locationId || undefined,
        items,
      });
      haptics.success();
      setModalOpen(false);
    } catch {
      haptics.error();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Purchase Orders
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Create supplier restock orders and receive deliveries directly into inventory.
          </p>
        </div>

        <button
          type="button"
          disabled={suppliers.length === 0 || products.length === 0}
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Purchase Order
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {purchases.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold">No purchase orders yet</div>
            <p className="text-xs text-slate-500">
              Create a purchase order to replenish stock from a supplier.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">PO Number</th>
                  <th className="py-3 px-4 font-medium">Supplier</th>
                  <th className="py-3 px-4 font-medium">Items</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Total Cost</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {purchases.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {po.purchaseNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      {po.supplierName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {po.items.map((i) => `${i.productName} (×${i.quantity})`).join(', ')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(po.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          po.status === 'received'
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-amber-600 dark:text-amber-400 font-semibold'
                        }
                      >
                        {po.status === 'received' ? 'Received' : 'Ordered'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(po.totalCost, currency)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {po.status === 'ordered' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await receivePurchaseOrder(po.id);
                              haptics.success();
                            } catch {
                              haptics.error();
                            }
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Received
                        </button>
                      ) : (
                        <span className="text-slate-400">Stocked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create Purchase Order"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold">New Purchase Order</h2>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Supplier</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Receiving Location</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Product</label>
                  <select
                    value={selectedProdId}
                    onChange={(e) => setSelectedProdId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCurrency(p.purchasePrice, currency)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500 text-center">
                    Add one or more products to this purchase order.
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.productId}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <span>
                        {item.productName} <span className="font-mono text-slate-500">×{item.quantity}</span>
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatCurrency(item.lineTotal, currency)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold">
                  Order Total:{' '}
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    {formatCurrency(
                      items.reduce((s, i) => s + i.lineTotal, 0),
                      currency
                    )}
                  </span>
                </span>
                <div className="flex gap-2">
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
                    disabled={submitting || items.length === 0}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                  >
                    {submitting ? 'Creating...' : 'Create PO'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
