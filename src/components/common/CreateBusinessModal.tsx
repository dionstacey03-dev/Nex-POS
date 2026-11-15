import React, { useState } from 'react';
import { Building2, X } from 'lucide-react';
import { BusinessType, CurrencyCode } from '../../types/nexpos';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import { useNexPos } from '../../context/NexPosContext';
import { haptics } from '../../utils/haptics';

interface CreateBusinessModalProps {
  open: boolean;
  onClose: () => void;
  canClose?: boolean;
}

const BUSINESS_TYPES: Array<{ value: BusinessType; label: string }> = [
  { value: 'retail', label: 'Retail & Supermarket' },
  { value: 'cafe', label: 'Restaurant & Café' },
  { value: 'pharmacy', label: 'Pharmacy & Wellness' },
  { value: 'apparel', label: 'Apparel & Fashion' },
  { value: 'electronics', label: 'Electronics Store' },
  { value: 'general', label: 'General SMB' },
];

export const CreateBusinessModal: React.FC<CreateBusinessModalProps> = ({
  open,
  onClose,
  canClose = true,
}) => {
  const { createBusiness } = useNexPos();
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('retail');
  const [currency, setCurrency] = useState<CurrencyCode>('LKR');
  const [taxRate, setTaxRate] = useState('8');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [seedSample, setSeedSample] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      haptics.warning();
      setError('Business name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createBusiness(
        {
          name: name.trim(),
          businessType,
          currency,
          taxRate: Number(taxRate) || 0,
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
        },
        seedSample
      );
      haptics.success();
      setName('');
      setAddress('');
      setPhone('');
      onClose();
    } catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : 'Failed to create business.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create Business Workspace"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Create Business Workspace
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure store profile, currency, and default tax settings.
              </p>
            </div>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={() => {
                haptics.light();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Business Name
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Colombo Urban Pharmacy"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Industry
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tax Rate (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Address (Optional)
              </label>
              <input
                type="text"
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Phone (Optional)
              </label>
              <input
                type="text"
                maxLength={40}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+94 11 234 5678"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={seedSample}
              onChange={(e) => {
                haptics.selection();
                setSeedSample(e.target.checked);
              }}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Populate sample starter catalog
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Adds sample categories, products, customers, and suppliers so you can test checkout right away.
              </div>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            {canClose && (
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
