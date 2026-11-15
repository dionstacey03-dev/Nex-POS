import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  Delete,
  LayoutGrid,
  Minus,
  Percent,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  UserPlus,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { CartItem, DiscountConfig, FIELD_LIMITS, PaymentMethod, Product } from '../../types/nexpos';
import { calculateCartTotals, formatCurrency, roundMoney } from '../../utils/currency';
import { LongPressProductCard } from '../common/LongPressProductCard';
import { QuickQuantityModal } from '../common/QuickQuantityModal';
import { SwipeableCartItem } from '../common/SwipeableCartItem';
import { haptics } from '../../utils/haptics';

export const PosTerminalView: React.FC = () => {
  const {
    activeBusiness,
    products,
    categories,
    customers,
    locations,
    saveCustomer,
    completeSale,
    setViewingReceipt,
    cart,
    scannerModeActive,
    toggleScannerMode,
    posNotice,
    setPosNotice,
    addProductToCart,
    addCustomItemToCart,
    scanBarcodeToCart,
    updateCartQuantity,
    setCartItemQuantity,
    removeFromCart,
    clearCart,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const taxRate = activeBusiness?.taxRate ?? 0;

  const [posMode, setPosMode] = useState<'catalog' | 'quicksale'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [discount, setDiscount] = useState<DiscountConfig>({ type: 'fixed', value: 0 });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    () => locations.find((l) => l.isDefault)?.id ?? ''
  );

  // Quick Sale Custom Item State
  const [quickDescription, setQuickDescription] = useState('');
  const [quickPriceInput, setQuickPriceInput] = useState('');
  const [quickQuantity, setQuickQuantity] = useState(1);

  // Checkout Modal State
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTenderedInput, setAmountTenderedInput] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Quick Add Customer Modal
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');

  // Long-Press Quick Quantity Adjuster & Swipe Undo State
  const [qtyAdjustTarget, setQtyAdjustTarget] = useState<{
    product: Product;
    isCustom?: boolean;
  } | null>(null);
  const [lastRemovedItem, setLastRemovedItem] = useState<CartItem | null>(null);

  const activeProducts = useMemo(
    () =>
      products.filter((p) => {
        if (!p.active) return false;
        if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
          );
        }
        return true;
      }),
    [products, selectedCategory, searchQuery]
  );

  const totals = useMemo(
    () => calculateCartTotals(cart, discount, taxRate),
    [cart, discount, taxRate]
  );

  const handleAddProduct = (product: (typeof products)[number]) => {
    const res = addProductToCart(product);
    if (res.ok) {
      haptics.light();
    } else {
      haptics.warning();
    }
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    const currentItem = cart.find((c) => c.product.id === productId);
    if (
      currentItem &&
      !currentItem.isCustom &&
      delta > 0 &&
      currentItem.quantity + delta > currentItem.product.stockQuantity
    ) {
      haptics.warning();
    } else if (currentItem && currentItem.quantity + delta <= 0) {
      haptics.medium();
    } else {
      haptics.light();
    }
    updateCartQuantity(productId, delta);
  };

  const handleRemoveCartItem = (item: CartItem) => {
    setLastRemovedItem(item);
    removeFromCart(item.product.id);
  };

  const handleUndoRemoveCartItem = () => {
    if (!lastRemovedItem) return;
    const res = setCartItemQuantity(
      lastRemovedItem.product,
      lastRemovedItem.quantity,
      lastRemovedItem.isCustom
    );
    if (res.ok) {
      haptics.success();
    } else {
      haptics.warning();
    }
    setLastRemovedItem(null);
  };

  const handleApplyQuickQuantity = (
    product: Product,
    nextQty: number,
    isCustom?: boolean
  ) => {
    const res = setCartItemQuantity(product, nextQty, isCustom);
    if (res.ok) {
      haptics.success();
      setQtyAdjustTarget(null);
      if (lastRemovedItem?.product.id === product.id) {
        setLastRemovedItem(null);
      }
    } else {
      haptics.warning();
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = scanBarcodeToCart(barcodeInput);
    if (res.ok) {
      haptics.success();
      setBarcodeInput('');
    } else {
      haptics.warning();
    }
  };

  const parsedQuickPrice = useMemo(() => {
    const val = Number(quickPriceInput);
    return Number.isFinite(val) && val > 0 ? roundMoney(val) : 0;
  }, [quickPriceInput]);

  const quickLineTotal = useMemo(
    () => roundMoney(parsedQuickPrice * quickQuantity),
    [parsedQuickPrice, quickQuantity]
  );

  const handleKeypadPress = (key: string) => {
    haptics.light();
    setQuickPriceInput((prev) => {
      if (key === 'clear') return '';
      if (key === 'backspace') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : `${prev}.`;
      }
      const [, dec] = prev.split('.');
      if (dec !== undefined && dec.length >= 2) return prev;
      if (prev === '0' && key !== '.') return key;
      if (prev.length >= 10) return prev;
      return `${prev}${key}`;
    });
  };

  const resetQuickSaleFields = () => {
    setQuickDescription('');
    setQuickPriceInput('');
    setQuickQuantity(1);
  };

  const handleAddQuickSaleItem = (proceedToCheckout: boolean) => {
    const res = addCustomItemToCart({
      description: quickDescription,
      price: parsedQuickPrice,
      quantity: quickQuantity,
    });
    if (!res.ok) {
      haptics.warning();
      return;
    }

    resetQuickSaleFields();
    if (proceedToCheckout && res.nextCart) {
      const nextTotals = calculateCartTotals(res.nextCart, discount, taxRate);
      openCheckoutModal(nextTotals.grandTotal);
    } else {
      haptics.success();
      setPosNotice({ type: 'success', text: res.message });
    }
  };

  const openCheckoutModal = (overrideGrandTotal?: number) => {
    const due = overrideGrandTotal ?? totals.grandTotal;
    if (overrideGrandTotal === undefined && cart.length === 0) return;
    haptics.medium();
    setPosNotice(null);
    setPaymentMethod('cash');
    setAmountTenderedInput(String(due));
    setPaymentReference('');
    setCheckoutOpen(true);
  };

  const parsedTendered = useMemo(() => {
    if (paymentMethod !== 'cash') return totals.grandTotal;
    const n = Number(amountTenderedInput);
    return Number.isFinite(n) ? roundMoney(n) : 0;
  }, [paymentMethod, amountTenderedInput, totals.grandTotal]);

  const cashChangeDue = useMemo(() => {
    if (paymentMethod !== 'cash') return 0;
    return roundMoney(Math.max(0, parsedTendered - totals.grandTotal));
  }, [paymentMethod, parsedTendered, totals.grandTotal]);

  const cashQuickAmounts = useMemo(() => {
    const gt = totals.grandTotal;
    if (gt <= 0) return [];
    const exact = roundMoney(gt);
    const step = gt >= 1000 ? 500 : gt >= 100 ? 50 : 10;
    const roundUp1 = Math.ceil(gt / step) * step;
    const roundUp2 = roundUp1 + step;
    const roundUp3 = roundUp1 + step * 2;
    return Array.from(new Set([exact, roundUp1, roundUp2, roundUp3]));
  }, [totals.grandTotal]);

  const handleCompleteSale = async () => {
    if (isSubmittingSale || cart.length === 0) return;
    if (paymentMethod === 'cash' && parsedTendered < totals.grandTotal) {
      haptics.error();
      setPosNotice({
        type: 'error',
        text: `Cash tendered (${formatCurrency(parsedTendered, currency)}) is less than Grand Total (${formatCurrency(totals.grandTotal, currency)}).`,
      });
      return;
    }

    setIsSubmittingSale(true);
    setPosNotice(null);
    try {
      const cust = customers.find((c) => c.id === selectedCustomerId);
      const completedSale = await completeSale({
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: item.product.sellingPrice,
          costPrice: item.product.purchasePrice,
          lineTotal: roundMoney(item.product.sellingPrice * item.quantity),
          isCustom: item.isCustom ? true : undefined,
        })),
        customerId: cust?.id,
        customerName: cust?.name,
        locationId: selectedLocationId || locations.find((l) => l.isDefault)?.id,
        subtotal: totals.subtotal,
        discountType: discount.value > 0 ? discount.type : undefined,
        discountValue: discount.value > 0 ? discount.value : undefined,
        discountAmount: totals.discountAmount,
        taxRate,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
        paymentMethod,
        amountTendered: paymentMethod === 'cash' ? parsedTendered : totals.grandTotal,
        changeDue: cashChangeDue,
        paymentReference: paymentReference.trim() || undefined,
      });

      haptics.success();
      clearCart();
      setDiscount({ type: 'fixed', value: 0 });
      setSelectedCustomerId('');
      setCheckoutOpen(false);
      setViewingReceipt(completedSale);
    } catch (err) {
      haptics.error();
      setPosNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to complete sale.',
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      haptics.warning();
      return;
    }
    try {
      const created = await saveCustomer({
        name: custName.trim(),
        phone: custPhone.trim() || undefined,
        email: custEmail.trim() || undefined,
        totalSpent: 0,
        ordersCount: 0,
      });
      haptics.success();
      setSelectedCustomerId(created.id);
      setCustName('');
      setCustPhone('');
      setCustEmail('');
      setNewCustomerOpen(false);
    } catch {
      haptics.error();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[calc(100vh-8.5rem)]">
      {/* Left: Mode Switcher + Catalog Grid or Quick Sale Custom Register */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        {/* Terminal Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            role="tablist"
            aria-label="POS Terminal Mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={posMode === 'catalog'}
              onClick={() => {
                haptics.selection();
                setPosMode('catalog');
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                posMode === 'catalog'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Catalog Register
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={posMode === 'quicksale'}
              onClick={() => {
                haptics.selection();
                setPosMode('quicksale');
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                posMode === 'quicksale'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Quick Sale
            </button>
          </div>

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {posMode === 'quicksale'
              ? 'Custom non-inventoried item · No SKU or stock deduction'
              : `${activeProducts.length} active item${activeProducts.length === 1 ? '' : 's'} · Tap to add, hold for qty`}
          </span>
        </div>

        {/* Inline Notice */}
        {posNotice && (
          <div
            className={`rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between border ${
              posNotice.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <span>{posNotice.text}</span>
            <button
              type="button"
              onClick={() => setPosNotice(null)}
              className="p-1 cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {posMode === 'quicksale' ? (
          /* Quick Sale Non-Inventoried Custom Item Workspace */
          <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Quick Sale · Custom Item
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Enter a description and price to charge a non-inventoried item or service at checkout.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left Column: Description, Price Input & Quantity */}
                <div className="xl:col-span-7 space-y-4">
                  <div>
                    <label
                      htmlFor="quicksale-description"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Item Description
                    </label>
                    <input
                      id="quicksale-description"
                      type="text"
                      maxLength={FIELD_LIMITS.PRODUCT_NAME_MAX}
                      value={quickDescription}
                      onChange={(e) => setQuickDescription(e.target.value)}
                      placeholder="e.g. Custom gift wrapping, Repair service, Misc item..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {['Custom Item', 'Service Charge', 'Gift Wrapping', 'Delivery Fee'].map(
                        (preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              haptics.selection();
                              setQuickDescription(preset);
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                              quickDescription === preset
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {preset}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="quicksale-price"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Unit Price ({currency})
                      </label>
                      <input
                        id="quicksale-price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={quickPriceInput}
                        onChange={(e) => setQuickPriceInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Quantity
                      </label>
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-1.5 h-[50px]">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.light();
                            setQuickQuantity((q) => Math.max(1, q - 1));
                          }}
                          className="w-10 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label="Decrease custom item quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {quickQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            haptics.light();
                            setQuickQuantity((q) => q + 1);
                          }}
                          className="w-10 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label="Increase custom item quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Line Total Preview Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Custom Item Line Total
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {quickQuantity} × {formatCurrency(parsedQuickPrice, currency)}
                        {taxRate > 0 ? ` (+ ${taxRate}% tax at checkout)` : ''}
                      </div>
                    </div>
                    <div className="text-xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                      {formatCurrency(quickLineTotal, currency)}
                    </div>
                  </div>
                </div>

                {/* Right Column: Touchscreen Numeric Price Keypad */}
                <div className="xl:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Touch Price Keypad
                    </span>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('clear')}
                      className="text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleKeypadPress(digit)}
                        className="py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-base font-mono font-semibold text-slate-900 dark:text-slate-100 active:scale-[0.97] transition-transform cursor-pointer"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('backspace')}
                      aria-label="Backspace price"
                      className="py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-[0.97] transition-transform cursor-pointer"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Sale Primary Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleAddQuickSaleItem(false)}
                className="py-3.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add to Order
              </button>
              <button
                type="button"
                onClick={() => handleAddQuickSaleItem(true)}
                className="py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {cart.length > 0 ? 'Add & Checkout' : 'Quick Checkout'}
                {quickLineTotal > 0 ? ` · ${formatCurrency(quickLineTotal, currency)}` : ''}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search & Barcode Strip */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name, SKU, or barcode..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <form onSubmit={handleBarcodeSubmit} className="md:col-span-5 flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan barcode / SKU + Enter"
                    className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Add Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.medium();
                    toggleScannerMode();
                  }}
                  aria-pressed={scannerModeActive}
                  title="Toggle hands-free global barcode scanner mode"
                  className={`px-3 py-3 rounded-xl border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    scannerModeActive
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {scannerModeActive ? 'Auto-Scan ON' : 'Auto-Scan'}
                </button>
              </form>
            </div>

            {/* Category Touch Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setSelectedCategory('all');
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedCategory === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All Categories
              </button>
              {categories
                .filter((c) => c.active)
                .map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setSelectedCategory(cat.id);
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedCategory === cat.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
            </div>

            {/* Product Touch Grid */}
            {activeProducts.length === 0 ? (
              <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 flex flex-col items-center justify-center text-center">
                <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  No matching active products
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Adjust your search filter or switch to Quick Sale for a custom item.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {activeProducts.map((product) => {
                  const inCartQty = cart.find((c) => c.product.id === product.id)?.quantity ?? 0;
                  return (
                    <LongPressProductCard
                      key={product.id}
                      product={product}
                      currency={currency}
                      inCartQty={inCartQty}
                      onTapAdd={handleAddProduct}
                      onLongPressAdjust={(prod) =>
                        setQtyAdjustTarget({ product: prod, isCustom: false })
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Current Order Cart & Checkout Panel */}
      <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
        {/* Cart Header + Customer & Location */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Current Order
              </h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                ({totals.itemCount} items)
              </span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  haptics.medium();
                  setLastRemovedItem(null);
                  clearCart();
                }}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Customer Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              aria-label="Select customer"
              className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Walk-in Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNewCustomerOpen(true)}
              title="Quick add customer"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              aria-label="Add new customer"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>

          {locations.length > 1 && (
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              aria-label="Select inventory location"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  Register Location: {loc.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Cart Gesture Hint + Undo Removed Banner */}
        {cart.length > 0 && (
          <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Swipe left on item to delete</span>
            <span>Hold row for qty</span>
          </div>
        )}

        {lastRemovedItem && (
          <div className="px-4 py-2 border-b border-amber-200 dark:border-amber-900/70 bg-amber-50/90 dark:bg-amber-950/40 text-xs flex items-center justify-between gap-2">
            <span className="text-amber-900 dark:text-amber-200 truncate">
              Removed <span className="font-semibold">{lastRemovedItem.product.name}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleUndoRemoveCartItem}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </button>
              <button
                type="button"
                onClick={() => setLastRemovedItem(null)}
                className="p-0.5 text-amber-700 dark:text-amber-300 cursor-pointer"
                aria-label="Dismiss undo bar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Cart Line Items */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 dark:divide-slate-800 min-h-[220px] max-h-[380px] lg:max-h-none">
          {cart.length === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <ShoppingCart className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Tap any product card, hold to set quantity, scan a barcode, or use Quick Sale.
              </p>
              {posMode === 'catalog' && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPosMode('quicksale');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Open Quick Sale
                </button>
              )}
            </div>
          ) : (
            cart.map((item) => (
              <SwipeableCartItem
                key={item.product.id}
                item={item}
                currency={currency}
                onQuantityDelta={handleQuantityChange}
                onRemove={handleRemoveCartItem}
                onLongPressAdjust={(target) =>
                  setQtyAdjustTarget({ product: target.product, isCustom: target.isCustom })
                }
              />
            ))
          )}
        </div>

        {/* Discount & Totals Summary */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3">
          {/* Discount Input */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setDiscount((d) => ({ ...d, type: 'fixed' }));
                }}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer ${
                  discount.type === 'fixed'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {currency}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setDiscount((d) => ({ ...d, type: 'percent' }));
                }}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer flex items-center ${
                  discount.type === 'percent'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Percent className="w-3 h-3" />
              </button>
            </div>
            <input
              type="number"
              min={0}
              max={discount.type === 'percent' ? 100 : undefined}
              step="0.01"
              value={discount.value || ''}
              onChange={(e) =>
                setDiscount((d) => ({
                  ...d,
                  value: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              onBlur={() => {
                if (discount.value > 0) haptics.light();
              }}
              placeholder={discount.type === 'percent' ? 'Discount %' : 'Discount amount'}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Totals Lines */}
          <div className="space-y-1.5 text-xs tabular-nums">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(totals.subtotal, currency)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="font-mono">-{formatCurrency(totals.discountAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Tax ({taxRate}%)</span>
              <span className="font-mono">{formatCurrency(totals.taxAmount, currency)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-800 text-base font-bold text-slate-900 dark:text-slate-100">
              <span>Grand Total</span>
              <span className="font-mono text-lg text-blue-600 dark:text-blue-400">
                {formatCurrency(totals.grandTotal, currency)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => openCheckoutModal()}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Charge {formatCurrency(totals.grandTotal, currency)}
          </button>
        </div>
      </div>

      {/* Payment Checkout Modal */}
      {checkoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Complete Sale Payment"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Record Payment
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  Amount Due: {formatCurrency(totals.grandTotal, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Close payment modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Payment Method Tabs */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPaymentMethod('cash');
                    setAmountTenderedInput(String(totals.grandTotal));
                  }}
                  className={`py-3 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                    paymentMethod === 'cash'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPaymentMethod('card');
                  }}
                  className={`py-3 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                    paymentMethod === 'card'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  Card
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setPaymentMethod('other');
                  }}
                  className={`py-3 px-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                    paymentMethod === 'other'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                  Other
                </button>
              </div>

              {paymentMethod === 'cash' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Cash Tendered ({currency})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amountTenderedInput}
                      onChange={(e) => setAmountTenderedInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {/* Quick Denomination Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {cashQuickAmounts.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setAmountTenderedInput(String(amt));
                        }}
                        className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-mono font-semibold tabular-nums cursor-pointer"
                      >
                        {formatCurrency(amt, currency)}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl bg-slate-100 dark:bg-slate-800/80 p-3.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Change Due
                    </span>
                    <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatCurrency(cashChangeDue, currency)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3 text-xs text-slate-600 dark:text-slate-300">
                    Recorded transaction only: confirm payment on your external terminal or QR app before completing sale.
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Approval / Reference Code (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={paymentMethod === 'card' ? 'e.g. VISA-4481' : 'e.g. QR-REF-9012'}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={
                  isSubmittingSale ||
                  (paymentMethod === 'cash' && parsedTendered < totals.grandTotal)
                }
                onClick={handleCompleteSale}
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmittingSale
                  ? 'Finalizing Transaction...'
                  : `Complete Sale · ${formatCurrency(totals.grandTotal, currency)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {newCustomerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Quick Add Customer"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Quick Add Customer
              </h3>
              <button
                type="button"
                onClick={() => setNewCustomerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewCustomerOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Quantity Adjuster Modal (Long-Press Gesture) */}
      <QuickQuantityModal
        open={qtyAdjustTarget !== null}
        product={qtyAdjustTarget?.product ?? null}
        currentCartQty={
          qtyAdjustTarget
            ? cart.find((c) => c.product.id === qtyAdjustTarget.product.id)?.quantity ?? 0
            : 0
        }
        isCustom={qtyAdjustTarget?.isCustom}
        currency={currency}
        onClose={() => setQtyAdjustTarget(null)}
        onApplyQuantity={handleApplyQuickQuantity}
      />
    </div>
  );
};
