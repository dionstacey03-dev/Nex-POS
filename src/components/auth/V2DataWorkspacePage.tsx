import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Database, LoaderCircle, LogOut, Package, Users, Receipt, Boxes, Plus, ArrowDownUp } from 'lucide-react';
import { authClient, useV2Session } from '../../lib/auth-client';
import { getBusinesses, getWorkspace, createProduct, updateProduct, archiveProduct, adjustStock, type CreateProductRequest, type UpdateProductRequest, type V2BusinessSummary, type V2WorkspaceSnapshot } from '../../services/v2Api';

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
  const { data: session, isPending } = useV2Session();
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
  const [editingProductId, setEditingProductId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', sku: '', categoryId: '', locationId: '', purchasePrice: '0', sellingPrice: '0', minStockLevel: '0', description: '' });

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

  const beginEditProduct = (row: Row) => {
    setEditingProductId(valueText(row.id, ''));
    setEditForm({ name: valueText(row.name, ''), sku: valueText(row.sku, ''), categoryId: valueText(row.categoryId, ''), locationId: valueText(row.locationId, ''), purchasePrice: String(row.purchasePrice ?? 0), sellingPrice: String(row.sellingPrice ?? 0), minStockLevel: String(row.minStockLevel ?? 0), description: valueText(row.description, '') });
    setError(''); setNotice('');
  };

  const handleUpdateProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !editingProductId) return;
    const payload: UpdateProductRequest = { name: editForm.name.trim(), sku: editForm.sku.trim(), categoryId: editForm.categoryId, locationId: editForm.locationId || null, purchasePrice: Number(editForm.purchasePrice), sellingPrice: Number(editForm.sellingPrice), minStockLevel: Number(editForm.minStockLevel), description: editForm.description.trim() || null };
    if (!payload.name || !payload.sku || !payload.categoryId || !Number.isFinite(payload.purchasePrice) || !Number.isFinite(payload.sellingPrice) || !Number.isFinite(payload.minStockLevel)) { setError('Check the product name, SKU, category and numeric fields.'); return; }
    setSaving(true); setError(''); setNotice('');
    try { await updateProduct(businessId, editingProductId, payload); await refreshSnapshot(); setEditingProductId(''); setNotice('Product details updated.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update product.'); }
    finally { setSaving(false); }
  };

  const handleArchiveProduct = async (row: Row) => {
    const productId = valueText(row.id, '');
    if (!businessId || !productId) return;
    if (!window.confirm('Archive ' + valueText(row.name, 'this product') + '? Products with remaining stock cannot be archived. Historical records are retained.')) return;
    setSaving(true); setError(''); setNotice('');
    try { await archiveProduct(businessId, productId); await refreshSnapshot(); setNotice('Product archived. Historical records have been retained.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not archive product.'); }
    finally { setSaving(false); }
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
    ? ['name', 'sku', 'categoryId', 'stockQuantity', 'sellingPrice', 'active', 'actions']
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
          <div><a href="/v2" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Back to workspaces</a><h1 className="mt-3 text-2xl font-bold">V2 Data Workspace</h1><p className="mt-1 text-sm text-slate-400">V2 workspace records and validated product management actions.</p></div>
          <button type="button" onClick={() => authClient.signOut({})} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><LogOut className="h-4 w-4" />Sign out</button>
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


        {section === 'products' && canManageProducts && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setProductFormOpen((open) => !open); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add product</button>
          <button type="button" onClick={() => { setSection('inventory'); setStockFormOpen(true); setError(''); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200"><ArrowDownUp className="h-4 w-4" />Adjust stock</button>
        </div>}

        {productFormOpen && section === 'products' && <form onSubmit={handleCreateProduct} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2">
          <div className="md:col-span-2"><h2 className="font-semibold">Create V2 product</h2><p className="mt-1 text-xs text-slate-400">New products start with zero stock. Add opening stock through a separate recorded adjustment.</p></div>
          <input required maxLength={140} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} placeholder="Product name" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required maxLength={64} value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} placeholder="SKU" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <select required value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">Choose category</option>{categoryRows.map((row) => <option key={valueText(row.id)} value={valueText(row.id)}>{valueText(row.name)}</option>)}</select>
          <select value={productForm.locationId} onChange={(event) => setProductForm({ ...productForm, locationId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">No location assigned</option>{locationRows.map((row) => <option key={valueText(row.id)} value={valueText(row.id)}>{valueText(row.name)}</option>)}</select>
          <input required type="number" min="0" step="0.01" value={productForm.purchasePrice} onChange={(event) => setProductForm({ ...productForm, purchasePrice: event.target.value })} placeholder="Purchase price" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required type="number" min="0" step="0.01" value={productForm.sellingPrice} onChange={(event) => setProductForm({ ...productForm, sellingPrice: event.target.value })} placeholder="Selling price" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required type="number" min="0" step="0.001" value={productForm.minStockLevel} onChange={(event) => setProductForm({ ...productForm, minStockLevel: event.target.value })} placeholder="Minimum stock level" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input maxLength={500} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="Description (optional)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <div className="flex flex-wrap items-center gap-2 md:col-span-2"><button disabled={saving || categoryRows.length === 0} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Create product'}</button><button type="button" onClick={() => setProductFormOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm">Cancel</button>{categoryRows.length === 0 && <span className="text-xs text-amber-300">Create a V2 category before adding products.</span>}</div>
        </form>}

        {section === 'inventory' && canManageProducts && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setStockFormOpen((open) => !open); setError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><ArrowDownUp className="h-4 w-4" />Record stock adjustment</button>
        </div>}
        {stockFormOpen && section === 'inventory' && <form onSubmit={handleStockAdjustment} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-2">
          <div className="md:col-span-2"><h2 className="font-semibold">Record stock adjustment</h2><p className="mt-1 text-xs text-slate-400">The API updates stock and writes its movement in one transaction. “Set quantity” uses the target stock level.</p></div>
          <select required value={stockForm.productId} onChange={(event) => setStockForm({ ...stockForm, productId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">Choose product</option>{productRows.map((row) => <option key={valueText(row.id)} value={valueText(row.id)}>{valueText(row.name)} · {valueText(row.sku)}</option>)}</select>
          <select value={stockForm.type} onChange={(event) => setStockForm({ ...stockForm, type: event.target.value as 'in' | 'out' | 'adjustment' })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Set quantity</option></select>
          <input required type="number" min="0.001" step="0.001" value={stockForm.quantityChange} onChange={(event) => setStockForm({ ...stockForm, quantityChange: event.target.value })} placeholder={stockForm.type === 'adjustment' ? 'Target quantity' : 'Quantity'} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required maxLength={240} value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} placeholder="Reason for adjustment" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <div className="flex gap-2 md:col-span-2"><button disabled={saving || productRows.length === 0} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Record adjustment'}</button><button type="button" onClick={() => setStockFormOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm">Cancel</button></div>
        </form>}

        {editingProductId && <form onSubmit={handleUpdateProduct} className="grid gap-3 rounded-2xl border border-blue-900 bg-slate-900 p-4 md:grid-cols-2">
          <div className="md:col-span-2"><h2 className="font-semibold">Edit product</h2><p className="mt-1 text-xs text-slate-400">Changes are validated by the V2 API and recorded in the audit log.</p></div>
          <input required maxLength={140} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} placeholder="Product name" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required maxLength={64} value={editForm.sku} onChange={(event) => setEditForm({ ...editForm, sku: event.target.value })} placeholder="SKU" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <select required value={editForm.categoryId} onChange={(event) => setEditForm({ ...editForm, categoryId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">Choose category</option>{categoryRows.map((row) => <option key={valueText(row.id)} value={valueText(row.id)}>{valueText(row.name)}</option>)}</select>
          <select value={editForm.locationId} onChange={(event) => setEditForm({ ...editForm, locationId: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">No location assigned</option>{locationRows.map((row) => <option key={valueText(row.id)} value={valueText(row.id)}>{valueText(row.name)}</option>)}</select>
          <input required type="number" min="0" step="0.01" value={editForm.purchasePrice} onChange={(event) => setEditForm({ ...editForm, purchasePrice: event.target.value })} placeholder="Purchase price" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required type="number" min="0" step="0.01" value={editForm.sellingPrice} onChange={(event) => setEditForm({ ...editForm, sellingPrice: event.target.value })} placeholder="Selling price" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input required type="number" min="0" step="0.001" value={editForm.minStockLevel} onChange={(event) => setEditForm({ ...editForm, minStockLevel: event.target.value })} placeholder="Minimum stock level" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <input maxLength={500} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} placeholder="Description" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
          <div className="flex gap-2 md:col-span-2"><button disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditingProductId('')} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm">Cancel</button></div>
        </form>}
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div><h2 className="font-semibold">{labels[section]}</h2><p className="mt-1 text-xs text-slate-400">{rows.length.toLocaleString()} records shown</p></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${labels[section].toLowerCase()}…`} className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          {!snapshot ? <div className="p-10 text-center text-sm text-slate-400">{busy ? 'Loading workspace data…' : 'Select a business workspace to view its records.'}</div>
            : rows.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No matching records in this section.</div>
            : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-950/70 text-slate-400"><tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium capitalize">{column.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((row, index) => <tr key={valueText(row.id, String(index))} className="hover:bg-slate-800/40">{columns.map((column) => <td key={column} className="max-w-64 truncate px-4 py-3 text-slate-200">{column === 'actions' && section === 'products' && canManageProducts ? <div className="flex gap-2"><button type="button" disabled={saving || row.active === false} onClick={() => beginEditProduct(row)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-40">Edit</button><button type="button" disabled={saving || row.active === false} onClick={() => handleArchiveProduct(row)} className="rounded-lg border border-rose-900 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-40">Archive</button></div> : column === 'sellingPrice' || column === 'totalSpent' || column === 'grandTotal' ? formatMoney(row[column], snapshot.business.currency) : valueText(row[column])}</td>)}</tr>)}</tbody></table></div>}
        </section>
        <p className="text-xs leading-relaxed text-slate-500">Product creation, editing, archiving and stock adjustments now use the V2 server API. Archiving preserves history and is blocked while stock remains.</p>
      </div>
    </main>
  );
};
