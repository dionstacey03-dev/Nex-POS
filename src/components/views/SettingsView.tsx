import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Lock,
  Mail,
  Save,
  Smartphone,
  Volume2,
  Waves,
} from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useNexPos } from '../../context/NexPosContext';
import {
  REGION_PRESETS,
  RegionLocaleId,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  TimeCyclePreference,
} from '../../i18n/types';
import { BusinessType, CurrencyCode } from '../../types/nexpos';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import {
  HapticIntensity,
  HapticPattern,
  HapticPreferences,
  haptics,
} from '../../utils/haptics';

export const SettingsView: React.FC = () => {
  const {
    mode,
    activeBusiness,
    products,
    currentUserEmail,
    can,
    theme,
    setTheme,
    updateBusinessSettings,
    setActiveSection,
  } = useNexPos();

  const {
    language,
    regionLocale,
    effectiveLocale,
    timeCycle,
    setLanguage,
    setRegionLocale,
    setTimeCycle,
    t,
    formatMoney,
    formatNumber,
    formatPercent,
    formatDate,
    formatTime,
  } = useI18n();

  const canManage = can('manage_settings');
  const [matchRegionOnLangChange, setMatchRegionOnLangChange] = useState(true);

  const [name, setName] = useState(activeBusiness?.name ?? '');
  const [businessType, setBusinessType] = useState<BusinessType>(
    activeBusiness?.businessType ?? 'retail'
  );
  const [logoUrl, setLogoUrl] = useState(activeBusiness?.logoUrl ?? '');
  const [address, setAddress] = useState(activeBusiness?.address ?? '');
  const [phone, setPhone] = useState(activeBusiness?.phone ?? '');
  const [email, setEmail] = useState(activeBusiness?.email ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(activeBusiness?.currency ?? 'LKR');
  const [taxRate, setTaxRate] = useState(String(activeBusiness?.taxRate ?? 0));
  const [receiptHeader, setReceiptHeader] = useState(activeBusiness?.receiptHeader ?? '');
  const [receiptFooter, setReceiptFooter] = useState(activeBusiness?.receiptFooter ?? '');
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Notification Management state
  const [lowStockAlertEnabled, setLowStockAlertEnabled] = useState<boolean>(
    activeBusiness?.lowStockAlertEnabled ?? false
  );
  const [lowStockAlertEmail, setLowStockAlertEmail] = useState<string>(
    activeBusiness?.lowStockAlertEmail ?? ''
  );
  const [lowStockAlertTime, setLowStockAlertTime] = useState<string>(
    activeBusiness?.lowStockAlertTime ?? '09:00'
  );
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifSavedToast, setNotifSavedToast] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [copiedDigest, setCopiedDigest] = useState(false);

  // Haptic Feedback local preferences & test state
  const [hapticPrefs, setHapticPrefs] = useState<HapticPreferences>(() =>
    haptics.getPreferences()
  );
  const [testPattern, setTestPattern] = useState<HapticPattern>('success');
  const [hapticTestStatus, setHapticTestStatus] = useState<string | null>(null);
  const hapticCapability = useMemo(() => haptics.getCapability(), []);

  useEffect(() => haptics.subscribe(setHapticPrefs), []);

  useEffect(() => {
    if (!activeBusiness) return;
    setName(activeBusiness.name);
    setBusinessType(activeBusiness.businessType);
    setLogoUrl(activeBusiness.logoUrl ?? '');
    setAddress(activeBusiness.address ?? '');
    setPhone(activeBusiness.phone ?? '');
    setEmail(activeBusiness.email ?? '');
    setCurrency(activeBusiness.currency);
    setTaxRate(String(activeBusiness.taxRate));
    setReceiptHeader(activeBusiness.receiptHeader ?? '');
    setReceiptFooter(activeBusiness.receiptFooter ?? '');
    setLowStockAlertEnabled(Boolean(activeBusiness.lowStockAlertEnabled));
    setLowStockAlertEmail(activeBusiness.lowStockAlertEmail ?? '');
    setLowStockAlertTime(activeBusiness.lowStockAlertTime ?? '09:00');
    setNotifError(null);
  }, [activeBusiness]);

  const lowStockItems = useMemo(
    () =>
      products
        .filter((p) => p.active && p.stockQuantity <= p.minStockLevel)
        .sort((a, b) => a.stockQuantity - b.stockQuantity),
    [products]
  );

  const digestPlainText = useMemo(() => {
    const bizName = activeBusiness?.name ?? 'NexPOS Store';
    const dateStr = formatDate(new Date(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (lowStockItems.length === 0) {
      return `${bizName} — Daily Low-Stock Summary (${dateStr})\n\nAll active products are currently above their minimum stock thresholds.`;
    }
    const lines = lowStockItems.map(
      (p) =>
        `- ${p.name} (${p.sku}): ${p.stockQuantity} in stock / Min ${p.minStockLevel}${
          p.stockQuantity === 0 ? ' [OUT OF STOCK]' : ''
        }`
    );
    return `${bizName} — Daily Low-Stock Summary (${dateStr})\n\n${lowStockItems.length} product(s) at or below minimum stock level:\n${lines.join('\n')}`;
  }, [activeBusiness?.name, lowStockItems, formatDate]);

  const mailtoHref = useMemo(() => {
    const recipient = encodeURIComponent(lowStockAlertEmail.trim());
    const subject = encodeURIComponent(
      `${activeBusiness?.name ?? 'NexPOS'} — Daily Low-Stock Summary (${lowStockItems.length} SKU${
        lowStockItems.length === 1 ? '' : 's'
      })`
    );
    const body = encodeURIComponent(digestPlainText);
    return `mailto:${recipient}?subject=${subject}&body=${body}`;
  }, [lowStockAlertEmail, activeBusiness?.name, lowStockItems.length, digestPlainText]);

  if (!canManage) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-semibold">Administrative Access Required</h2>
        <p className="text-xs text-slate-500">
          Cashier accounts cannot modify business tax, currency, notification, or receipt settings.
        </p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setSavedToast(false);
    try {
      await updateBusinessSettings({
        name: name.trim(),
        businessType,
        logoUrl: logoUrl.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        currency,
        taxRate: Math.min(100, Math.max(0, Number(taxRate) || 0)),
        receiptHeader: receiptHeader.trim() || undefined,
        receiptFooter: receiptFooter.trim() || undefined,
      });
      setSavedToast(true);
      haptics.success();
      setTimeout(() => setSavedToast(false), 3000);
    } catch {
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotifError(null);
    setNotifSavedToast(false);

    const trimmedEmail = lowStockAlertEmail.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    if (lowStockAlertEnabled && !trimmedEmail) {
      setNotifError('Enter a recipient email address to enable daily low-stock summaries.');
      haptics.warning();
      return;
    }
    if (trimmedEmail && !isValidEmail) {
      setNotifError('Enter a valid email address (for example, inventory@yourstore.com).');
      haptics.warning();
      return;
    }

    setSavingNotif(true);
    try {
      await updateBusinessSettings({
        lowStockAlertEnabled,
        lowStockAlertEmail: trimmedEmail,
        lowStockAlertTime: lowStockAlertTime || '09:00',
      });
      setNotifSavedToast(true);
      haptics.success();
      setTimeout(() => setNotifSavedToast(false), 3000);
    } catch (err) {
      haptics.error();
      setNotifError(
        err instanceof Error ? err.message : 'Unable to save notification preferences.'
      );
    } finally {
      setSavingNotif(false);
    }
  };

  const handleCopyDigest = async () => {
    try {
      await navigator.clipboard.writeText(digestPlainText);
      setCopiedDigest(true);
      haptics.light();
      setTimeout(() => setCopiedDigest(false), 2500);
    } catch {
      // clipboard unavailable
    }
  };

  const handleToggleHaptics = () => {
    const next = haptics.setPreferences({ enabled: !hapticPrefs.enabled });
    if (next.enabled) {
      haptics.medium({ bypassCooldown: true });
    }
  };

  const handleSelectIntensity = (intensity: HapticIntensity) => {
    const next = haptics.setPreferences({ intensity });
    if (next.enabled) {
      haptics.medium({ bypassCooldown: true });
    }
  };

  const handleToggleAudioFallback = () => {
    const next = haptics.setPreferences({
      audioFallback: !hapticPrefs.audioFallback,
    });
    if (next.enabled) {
      haptics.selection({ bypassCooldown: true });
    }
  };

  const handleTestHaptic = () => {
    const res = haptics.trigger(testPattern, {
      bypassCooldown: true,
      force: true,
    });
    const parts: string[] = [];
    if (res.vibrated) parts.push('Vibration sent');
    if (res.audioPlayed) parts.push('Audio cue played');
    if (parts.length === 0) {
      parts.push('Visual cue active (browser Vibration API unavailable)');
    }
    setHapticTestStatus(`Tested "${testPattern}": ${parts.join(' · ')}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('settings.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('settings.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveSection('employees')}
          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
        >
          {t('nav.employees')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* General Business Profile Form */}
          <form
            onSubmit={handleSave}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.businessName')}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.businessType')}
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="retail">Retail &amp; Supermarket</option>
                  <option value="cafe">Restaurant &amp; Café</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="apparel">Clothing &amp; Apparel</option>
                  <option value="electronics">Electronics Store</option>
                  <option value="general">General SMB</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.baseCurrency')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('settings.taxRate')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Business Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Business Logo URL (Optional)
                </label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Receipt Header Message
                </label>
                <input
                  type="text"
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Receipt Footer / Return Policy
                </label>
                <input
                  type="text"
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                {savedToast && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="w-4 h-4" /> {t('settings.saved')}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? t('common.saving') : t('settings.saveAll')}
              </button>
            </div>
          </form>

          {/* Notification Management Section */}
          <form
            onSubmit={handleSaveNotifications}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Notification Management
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure an email address to receive automated daily summaries of products at or below minimum stock levels.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={lowStockAlertEnabled}
                onClick={() => {
                  setLowStockAlertEnabled((prev) => !prev);
                  setNotifError(null);
                  haptics.selection();
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  lowStockAlertEnabled
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span
                  className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                    lowStockAlertEnabled
                      ? 'bg-emerald-600 justify-end'
                      : 'bg-slate-300 dark:bg-slate-600 justify-start'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                </span>
                {lowStockAlertEnabled ? 'Daily Digest Enabled' : 'Daily Digest Paused'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="low-stock-alert-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Daily Summary Recipient Email
                  </label>
                  <div className="flex items-center gap-2">
                    {email.trim() && email.trim() !== lowStockAlertEmail.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setLowStockAlertEmail(email.trim());
                          setNotifError(null);
                        }}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Use store email
                      </button>
                    )}
                    {currentUserEmail && currentUserEmail !== lowStockAlertEmail.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setLowStockAlertEmail(currentUserEmail);
                          setNotifError(null);
                        }}
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Use my email
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="low-stock-alert-email"
                    type="email"
                    maxLength={160}
                    value={lowStockAlertEmail}
                    onChange={(e) => {
                      setLowStockAlertEmail(e.target.value);
                      setNotifError(null);
                    }}
                    placeholder="inventory@yourbusiness.com"
                    className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="low-stock-alert-time"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Daily Send Time
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="low-stock-alert-time"
                    type="time"
                    value={lowStockAlertTime}
                    onChange={(e) => setLowStockAlertTime(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>

            {notifError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300"
              >
                {notifError}
              </div>
            )}

            {/* Today's Low-Stock Digest Preview */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      lowStockItems.length > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Daily Summary Preview ({lowStockItems.length} SKU
                    {lowStockItems.length === 1 ? '' : 's'} at or below minimum)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDigest}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedDigest ? 'Copied' : 'Copy Summary'}
                  </button>
                  {lowStockAlertEmail.trim() && (
                    <a
                      href={mailtoHref}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Send Test Draft
                    </a>
                  )}
                </div>
              </div>

              {lowStockItems.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All active products are currently above their minimum stock thresholds. When any product drops to or below its minimum stock level, it will be listed in this daily digest.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3">
                  {lowStockItems.map((item) => (
                    <div
                      key={item.id}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {item.sku} · Min {item.minStockLevel}
                        </div>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums shrink-0 ${
                          item.stockQuantity === 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {item.stockQuantity === 0
                          ? 'Out of stock'
                          : `${item.stockQuantity} / ${item.minStockLevel}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {mode === 'firebase'
                  ? 'Schedule and recipient email are persisted to your Cloud Firestore business profile. Background delivery at the configured time requires connecting a scheduled email worker (e.g., Firebase Cloud Function or transactional email API).'
                  : 'In Demo Mode, notification preferences are stored in your local workspace session. Connect Cloud Firestore to persist settings across sessions.'}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                {notifSavedToast && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="w-4 h-4" /> Notification preferences saved
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={savingNotif}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingNotif ? 'Saving...' : 'Save Notification Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Language & Region + Theme + Haptic Feedback + Live Receipt Preview */}
        <div className="space-y-6">
          {/* Language & Regional Formatting Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('i18n.title')}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('i18n.subtitle')}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="settings-language-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {t('i18n.language')}
              </label>
              <select
                id="settings-language-select"
                value={language}
                onChange={(e) => {
                  haptics.selection();
                  setLanguage(e.target.value as SupportedLanguage, matchRegionOnLangChange);
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeName} — {lang.name} ({lang.shortCode}{lang.dir === 'rtl' ? ` · ${t('i18n.rtlBadge')}` : ''})
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={matchRegionOnLangChange}
                  onChange={(e) => setMatchRegionOnLangChange(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>{t('i18n.matchLanguageRegion')}</span>
              </label>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="settings-region-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {t('i18n.regionFormat')}
              </label>
              <select
                id="settings-region-select"
                value={regionLocale}
                onChange={(e) => {
                  haptics.selection();
                  setRegionLocale(e.target.value as RegionLocaleId);
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="auto">{t('i18n.autoRegion')}</option>
                {REGION_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('i18n.timeFormat')}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'auto', label: t('i18n.timeAuto') },
                    { id: '12h', label: t('i18n.time12h') },
                    { id: '24h', label: t('i18n.time24h') },
                  ] as { id: TimeCyclePreference; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setTimeCycle(opt.id);
                    }}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      timeCycle === opt.id
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Regional Formatting Preview */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <span>{t('i18n.previewTitle')}</span>
                <span className="font-mono">{effectiveLocale}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('i18n.previewCurrency')}</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatMoney(12345.67, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('i18n.previewNumber')}</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatNumber(98765.4)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('i18n.previewPercent')}</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatPercent(Number(taxRate) || 12.5)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('i18n.previewDate')}</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatDate(new Date())}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{t('i18n.previewTime')}</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatTime(new Date())}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold">{t('settings.themeLabel')}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setTheme('light');
                  haptics.selection();
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                  theme === 'light'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t('topbar.lightMode')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTheme('dark');
                  haptics.selection();
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                  theme === 'dark'
                    ? 'border-blue-600 bg-blue-950/50 text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t('topbar.darkMode')}
              </button>
            </div>
          </div>

          {/* Haptic Feedback Settings */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Waves className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Haptic Feedback
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tactile confirmation for POS actions and alerts.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={hapticPrefs.enabled}
                aria-label="Enable haptic feedback"
                onClick={handleToggleHaptics}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                  hapticPrefs.enabled
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {hapticPrefs.enabled ? 'On' : 'Off'}
              </button>
            </div>

            {/* Device Compatibility Status */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                  Device Compatibility
                </span>
                <span
                  className={`font-semibold ${
                    hapticCapability.status === 'supported'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : hapticCapability.status === 'limited'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {hapticCapability.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {hapticCapability.detail}
              </p>
            </div>

            {/* Intensity Preference */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Feedback Intensity
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['subtle', 'balanced', 'strong'] as HapticIntensity[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={!hapticPrefs.enabled}
                    onClick={() => handleSelectIntensity(level)}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold capitalize transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      hapticPrefs.intensity === level
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessible Audio Cue Alternative */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Subtle Audio Cue Alternative
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Soft tone cue for desktop or unsupported browsers
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hapticPrefs.audioFallback}
                aria-label="Toggle subtle audio cue alternative"
                onClick={handleToggleAudioFallback}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer shrink-0 ${
                  hapticPrefs.audioFallback
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {hapticPrefs.audioFallback ? 'On' : 'Off'}
              </button>
            </div>

            {/* Test Haptic Feedback Control */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={testPattern}
                  onChange={(e) => setTestPattern(e.target.value as HapticPattern)}
                  aria-label="Select haptic pattern to test"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="light">Pattern: Light</option>
                  <option value="medium">Pattern: Medium</option>
                  <option value="selection">Pattern: Selection</option>
                  <option value="success">Pattern: Success</option>
                  <option value="warning">Pattern: Warning</option>
                  <option value="error">Pattern: Error</option>
                </select>
                <button
                  type="button"
                  onClick={handleTestHaptic}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Test Haptic
                </button>
              </div>
              {hapticTestStatus && (
                <div
                  role="status"
                  className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-2.5 py-1.5"
                >
                  {hapticTestStatus}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold">{t('settings.receiptPreview')}</h2>
            <div className="rounded-xl border border-slate-200 bg-white text-slate-900 p-4 font-mono text-[11px] space-y-2 text-center">
              <div className="font-sans font-bold text-sm">{name || t('settings.businessName')}</div>
              {address && <div className="text-slate-500">{address}</div>}
              {phone && <div className="text-slate-500">{t('common.phone')}: {phone}</div>}
              {receiptHeader && <div className="font-sans text-slate-700 pt-1">{receiptHeader}</div>}
              <div className="border-y border-dashed border-slate-300 py-2 my-2 flex justify-between">
                <span>Sample Item ×1</span>
                <span className="tabular-nums">{formatMoney(1000, currency)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t('common.tax')} ({formatPercent(Number(taxRate) || 0, 1)})</span>
                <span className="tabular-nums">
                  {formatMoney((1000 * (Number(taxRate) || 0)) / 100, currency)}
                </span>
              </div>
              {receiptFooter && (
                <div className="font-sans text-[10px] text-slate-500 pt-2">{receiptFooter}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
