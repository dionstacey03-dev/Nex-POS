export function parseMoneyToMinorUnits(value: string | number): number {
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error('Invalid monetary amount.');
  }
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) throw new Error('Monetary amount is out of range.');
  return cents;
}

export function formatMinorUnits(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid minor-unit amount.');
  return (value / 100).toFixed(2);
}

export function calculateTaxMinorUnits(subtotalMinor: number, taxRatePercent: string | number): number {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error('Invalid subtotal.');
  const rate = Number(taxRatePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Invalid tax rate.');
  return Math.round(subtotalMinor * rate / 100);
}
