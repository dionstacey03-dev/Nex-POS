import React from 'react';
import { Printer, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { Business, Sale } from '../../types/nexpos';
import { formatCurrency } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

interface ReceiptModalProps {
  sale: Sale | null;
  business: Business | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, business, onClose }) => {
  if (!sale || !business) return null;

  const formattedDate = new Date(sale.createdAt).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Receipt ${sale.receiptNumber}`}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {sale.status === 'refunded' ? (
              <RotateCcw className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Receipt {sale.receiptNumber}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptics.medium();
                window.print();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Receipt
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close receipt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950/60">
          <div
            id="nexpos-printable-receipt"
            className="mx-auto max-w-[340px] bg-white text-slate-900 rounded-xl border border-slate-200 p-5 shadow-xs font-mono text-xs"
          >
            <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
              {business.logoUrl && (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  referrerPolicy="no-referrer"
                  className="h-10 w-auto mx-auto mb-2 object-contain"
                />
              )}
              <div className="text-sm font-bold tracking-tight font-sans">{business.name}</div>
              {business.address && (
                <div className="text-[11px] text-slate-600 mt-0.5">{business.address}</div>
              )}
              {business.phone && (
                <div className="text-[11px] text-slate-600">Tel: {business.phone}</div>
              )}
              {business.receiptHeader && (
                <div className="text-[11px] text-slate-700 mt-1.5 font-sans">
                  {business.receiptHeader}
                </div>
              )}
            </div>

            <div className="space-y-1 text-[11px] text-slate-700 border-b border-dashed border-slate-300 pb-2.5 mb-3">
              <div className="flex justify-between">
                <span>Receipt</span>
                <span className="font-semibold">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier</span>
                <span>{sale.cashierName}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between">
                  <span>Customer</span>
                  <span>{sale.customerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Status</span>
                <span className="uppercase font-semibold">{sale.status}</span>
              </div>
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-3 mb-3">
              <div className="flex justify-between text-[10px] text-slate-500 uppercase">
                <span>Item</span>
                <span>Total</span>
              </div>
              {sale.items.map((item, idx) => (
                <div key={`${item.productId}-${idx}`} className="space-y-0.5">
                  <div className="flex justify-between gap-2 font-medium text-slate-900">
                    <span className="truncate">{item.name}</span>
                    <span className="tabular-nums shrink-0">
                      {formatCurrency(item.lineTotal, business.currency)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 tabular-nums">
                    {item.quantity} x {formatCurrency(item.unitPrice, business.currency)}
                    {item.isCustom ? ' · Custom item' : ''}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-3 mb-3 tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(sale.subtotal, business.currency)}</span>
              </div>
              {sale.discountAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(sale.discountAmount, business.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Tax ({sale.taxRate}%)</span>
                <span>{formatCurrency(sale.taxAmount, business.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1">
                <span>Grand Total</span>
                <span>{formatCurrency(sale.grandTotal, business.currency)}</span>
              </div>
            </div>

            <div className="space-y-1 text-[11px] text-slate-700 tabular-nums">
              <div className="flex justify-between">
                <span>Payment</span>
                <span className="uppercase">{sale.paymentMethod}</span>
              </div>
              {sale.paymentReference && (
                <div className="flex justify-between">
                  <span>Reference</span>
                  <span>{sale.paymentReference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tendered</span>
                <span>{formatCurrency(sale.amountTendered, business.currency)}</span>
              </div>
              {sale.changeDue > 0 && (
                <div className="flex justify-between font-semibold">
                  <span>Change Due</span>
                  <span>{formatCurrency(sale.changeDue, business.currency)}</span>
                </div>
              )}
            </div>

            <div className="text-center mt-4 pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-500 font-sans">
              {business.receiptFooter || 'Thank you for your business.'}
              <div className="mt-1 text-slate-400">NexPOS · One Platform. Every Transaction.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
