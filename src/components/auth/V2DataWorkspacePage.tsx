import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Database, LoaderCircle, LogOut, Package, Users, Receipt, Boxes, Plus, ArrowDownUp } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { getBusinesses, getWorkspace, createProduct, adjustStock, type CreateProductRequest, type V2BusinessSummary, type V2WorkspaceSnapshot } from '../../services/v2Api';

type Section = 'products' | 'customers' | 'sales' | 'inventory';
type Row = Record<string, unknown>;

const asRows = (value: unknown[]): Row[] =>
  value.filter((item): item is Row => Boolean(item) && typeof item === 'object' && !Array.isArray(item));

const valueText = (value: unknown, fallback = '—'): string => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return fallback;
};

const formatMoney = (value: unknown, currency: string): string => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
};

export const V2DataWorkspacePage: React.FC = () => {
  const { data: session, isPending } = authClient.useSession();
  const [businesses, setBusinesses] = useState<V2BusinessSummary[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [snapshot, setSnapshot] = useState<V2WorkspaceSnapshot | null>(null);
  const [section, setSection] = useState<Section>('products');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [stockFormOpen, setStockFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productForm, setProductForm] = useState({ name: '', sku: '', categoryId: '', locationId: '', purchasePrice: '0', sellingPrice: '0', minStockLevel: '0', description: '' });
  const [stockForm, setStockForm] = useState({ productId: '', type: 'in' as 'in' | 'out' | 'adjustment', quantityChange: '1', reason: '' });

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    setBusy(true);
    getBusinesses()
      .then(({ businesses: rows }) => {
        if (cancelled) return;
        setBusinesses(rows);
        setBusinessId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load workspaces.');
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [session?.user]);

  useEffect(() => {
    if (!businessId || !session?.user) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError('');
    getWorkspace(businessId)
      .then((data) => { if (!cancelled) setSnapshot(data); })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setSnapshot(null);
          setError(cause instanceof Error ? cause.message : 'Could not load workspace data.');
        }
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [businessId, session?.user]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const source = section === 'products' ? snapshot.products
      : section === 'customers' ? snapshot.customers
      : section === 'sales' ? snapshot.sales
      : snapshot.stockMovements;
    const query = search.trim().toLowerCase();
    return asRows(source).filter((row) => !query || Object.values(row).some((value) =>
      (typeof value === 'string' || typeof value === 'number') && String(value).toLowerCase().includes(query)
    ));
  }, [snapshot, section, search]);


  const categoryRows = snapshot ? asRows(snapshot.categories) : [];
  const locationRows = snapshot ? asRows(snapshot.locations) : [];
  const productRows = snapshot ? asRows(snapshot.products) : [];
  const selectedBusiness = businesses.find((business) => business.id === businessId);
  const canManageProducts = selectedBusiness ? selectedBusiness.role !== 'cashier' : false;
  const refreshSnapshot = async () => {
    if (!businessId) return;
    setSnapshot(await getWorkspace(businessId));
  };

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !productForm.categoryId) {
      setError('Choose a category before creating the product.');
      return;
    }
    const payload: CreateProductRequest = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim(),
      categoryId: productForm.categoryId,
      purchasePrice: Number(productForm.purchasePrice),
      sellingPrice: Number(productForm.sellingPrice),
      minStockLevel: Number(productForm.minStockLevel),
      ...(productForm.description.trim() ? { description: productForm.description.trim() } : {}),
      ...(productForm.locationId ? { locationId: productForm.locationId } : {}),
    };
    if (!payload.name || !payload.sku || !Number.isFinite(payload.purchasePrice) || !Number.isFinite(payload.sellingPrice) || !Number.isFinite(payload.minStockLevel)) {
      setError('Enter a valid name, SKU, prices and minimum stock level.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await createProduct(businessId, payload);
      await refreshSnapshot();
      setProductForm({ name: '', sku: '', categoryId: '', locationId: '', purchasePrice: '0', sellingPrice: '0', minStockLevel: '0', description: '' });
      setProductFormOpen(false);
      setNotice('Product created. Initial stock is zero; use stock adjustment to add opening stock.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create product.');
    } finally {
      setSaving(false);
    }
  };

  const handleStockAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantityChange = Number(stockForm.quantityChange);
    if (!businessId || !stockForm.productId || !stockForm.reason.trim() || !Number.isFinite(quantityChange) || quantityChange <= 0) {
      setError('Select a product and enter a positive quantity and reason.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await adjustStock(businessId, stockForm.productId, {
        requestId: crypto.randomUUID(),
        type: stockForm.type,
        quantityChange,
        reason: stockForm.reason.trim(),
      });
      await refreshSnapshot();
      setStockForm((current) => ({ ...current, reason: '' }));
      setStockFormOpen(false);
      setNotice('Stock updated successfully. New quantity: ' + result.stockQuantity + '.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Stock adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  const columns = section === 'products'
    ? ['name', 'sku', 'categoryId', 'stockQuantity', 'sellingPrice', 'active']
    : section === 'customers'
      ? ['name', 'phone', 'email', 'ordersCount', 'totalSpent']
      : section === 'sales'
        ? ['receiptNumber', 'customerName', 'cashierName', 'grandTotal', 'paymentMethod', 'status', 'createdAt']
        : ['productName', 'type', 'quantityDelta', 'previousStock', 'newStock', 'reason', 'createdAt'];

  const labels: Record<Section, string> = {
    products: 'Products',
    customers: 'Customers',
    sales: 'Sales',
    inventory: 'Stock ledger',
  };

  if (isPending) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300"><LoaderCircle className="mr-3 h-5 w-5 animate-spin" />Checking V2 session…</main>;
  }

  if (!session?.user) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100"><section className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 text-center"><Database className="mx-auto h-8 w-8 text-blue-400" /><h1 className="mt-4 text-xl font-semibold">Sign in to NexPOS V2</h1><p className="mt-2 text-sm text-slate-400">Your V2 account is separate from the legacy Firebase sign-in.</p><a href="/v2" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold">Continue to V2 sign in</a></section></main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><a href="/v2" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Back to workspaces</a><h1 className="mt-3 text-2xl font-bold">V2 Data Workspace</h1><p className="mt-1 text-sm text-slate-400">Read-only view of records loaded from the Neon-backed API.</p></div>
          <button type="button" onClick={() => authClient.signOut()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><LogOut className="h-4 w-4" />Sign out</button>
        </header>

        {error && <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <label className="text-xs font-medium text-slate-400" htmlFor="v2-business">Business workspace</label>
          <select id="v2-business" value={businessId} onChange={(event) => setBusinessId(event.target.value)} className="min-w-64 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm">
            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name} · {business.role}</option>)}
          </select>
          {snapshot && <span className="text-xs text-slate-400">{snapshot.business.currency} · {snapshot.business.name}</span>}
          {busy && <LoaderCircle className="h-4 w-4 animate-spin text-blue-400" aria-label="Loading workspace" />}
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="V2 data sections">
          {([
            ['products', Package], ['customers', Users], ['sales', Receipt], ['inventory', Boxes],
          ] as const).map(([key, Icon]) => <button key={key} type="button" onClick={() => { setSection(key); setSearch(''); }} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${section === key ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'}`}><Icon className="h-4 w-4" />{labels[key]}</button>)}
        </nav>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div><h2 className="font-semibold">{labels[section]}</h2><p className="mt-1 text-xs text-slate-400">{rows.length.toLocaleString()} records shown · read-only</p></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${labels[section].toLowerCase()}…`} className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          {!snapshot ? <div className="p-10 text-center text-sm text-slate-400">{busy ? 'Loading workspace data…' : 'Select a business workspace to view its records.'}</div>
            : rows.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No matching records in this section.</div>
            : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-950/70 text-slate-400"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium capitalize">{column.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((row, index) => <tr key={valueText(row.id, String(index))} className="hover:bg-slate-800/40">{columns.map((column) => <td key={column} className="max-w-64 truncate px-4 py-3 text-slate-200">{column === 'sellingPrice' || column === 'totalSpent' || column === 'grandTotal' ? formatMoney(row[column], snapshot.business.currency) : valueText(row[column])}</td>)}</tr>)}</tbody></table></div>}
        </section>
        <p className="text-xs leading-relaxed text-slate-500">This first migration step is intentionally read-only. Writes remain on the existing application until each V2 mutation flow is validated against the server API and transaction rules.</p>
      </div>
    </main>
  );
};
