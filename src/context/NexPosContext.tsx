import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { createDemoDatasets, DEMO_AVATAR_URL } from '../data/demoData';
import {
  auth,
  isFirebaseConfigured,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  adjustStockInFirestore,
  createBusinessInFirestore,
  createPurchaseOrderInFirestore,
  deleteCategoryInFirestore,
  deleteProductInFirestore,
  deleteSupplierInFirestore,
  executeSaleTransactionInFirestore,
  fetchUserMemberships,
  generateId,
  MembershipSummary,
  receivePurchaseOrderInFirestore,
  refundSaleInFirestore,
  reorderCategoriesInFirestore,
  saveCategoryInFirestore,
  saveCustomerInFirestore,
  saveEmployeeInFirestore,
  saveLocationInFirestore,
  saveProductInFirestore,
  saveSupplierInFirestore,
  subscribeToBusinessWorkspace,
  updateBusinessSettingsInFirestore,
  upsertUserProfile,
} from '../services/posRepository';
import {
  AppNotification,
  Business,
  BusinessType,
  CartItem,
  Category,
  CurrencyCode,
  Customer,
  Employee,
  hasPermission,
  InventoryLocation,
  NavSection,
  PaymentMethod,
  Permission,
  Product,
  PurchaseItem,
  PurchaseOrder,
  Sale,
  SaleItem,
  StockMovement,
  Supplier,
  UserRole,
} from '../types/nexpos';
import { roundMoney } from '../utils/currency';

export type WorkspaceMode = 'demo' | 'firebase';

interface DemoStoreState {
  activeBusinessId: string;
  datasets: ReturnType<typeof createDemoDatasets>;
}

interface NexPosContextValue {
  mode: WorkspaceMode;
  firebaseAvailable: boolean;
  firebaseConnected: boolean;
  authUser: User | null;
  authReady: boolean;
  loadingData: boolean;
  errorBanner: string | null;
  clearError: () => void;

  theme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;

  activeSection: NavSection;
  setActiveSection: (section: NavSection) => void;

  // Current user & RBAC
  currentUserName: string;
  currentUserEmail: string;
  currentUserAvatar: string;
  currentRole: UserRole;
  setDemoRole: (role: UserRole) => void;
  can: (permission: Permission) => boolean;

  // Business switcher
  businesses: Array<{ id: string; name: string; role: UserRole }>;
  activeBusiness: Business | null;
  switchBusiness: (businessId: string) => void;
  createBusiness: (
    input: {
      name: string;
      businessType: BusinessType;
      currency: CurrencyCode;
      taxRate: number;
      address?: string;
      phone?: string;
      email?: string;
    },
    seedSample: boolean
  ) => Promise<void>;

  // Auth / Mode actions
  signInWithGoogle: () => Promise<void>;
  signOutToDemo: () => Promise<void>;
  switchToDemoMode: () => void;
  resetDemoData: () => void;

  // Active workspace data
  categories: Category[];
  locations: InventoryLocation[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  employees: Employee[];
  sales: Sale[];
  stockMovements: StockMovement[];
  purchases: PurchaseOrder[];
  notifications: AppNotification[];

  // Actions
  saveProduct: (product: Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  saveCategory: (category: Omit<Category, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  reorderCategories: (orderedCategoryIds: string[]) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
  saveCustomer: (customer: Omit<Customer, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<Customer>;
  saveSupplier: (supplier: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteSupplier: (supplierId: string) => Promise<void>;
  saveLocation: (location: Omit<InventoryLocation, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  adjustStock: (params: {
    productId: string;
    type: 'in' | 'out' | 'adjustment';
    quantityChange: number;
    reason: string;
    locationId?: string;
  }) => Promise<void>;
  completeSale: (params: {
    items: SaleItem[];
    customerId?: string;
    customerName?: string;
    locationId?: string;
    subtotal: number;
    discountType?: 'fixed' | 'percent';
    discountValue?: number;
    discountAmount: number;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
    paymentMethod: PaymentMethod;
    amountTendered: number;
    changeDue: number;
    paymentReference?: string;
  }) => Promise<Sale>;
  refundSale: (saleId: string) => Promise<void>;
  createPurchaseOrder: (params: {
    supplierId: string;
    supplierName: string;
    locationId?: string;
    items: PurchaseItem[];
  }) => Promise<void>;
  receivePurchaseOrder: (purchaseId: string) => Promise<void>;
  saveEmployee: (employee: Omit<Employee, 'businessId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateBusinessSettings: (
    updates: Partial<
      Pick<
        Business,
        | 'name'
        | 'businessType'
        | 'logoUrl'
        | 'address'
        | 'phone'
        | 'email'
        | 'currency'
        | 'taxRate'
        | 'receiptHeader'
        | 'receiptFooter'
        | 'lowStockAlertEnabled'
        | 'lowStockAlertEmail'
        | 'lowStockAlertTime'
      >
    >
  ) => Promise<void>;

  // POS Terminal Cart & Barcode Scanner Mode
  cart: CartItem[];
  scannerModeActive: boolean;
  setScannerModeActive: (active: boolean) => void;
  toggleScannerMode: () => void;
  posNotice: { type: 'error' | 'success'; text: string } | null;
  setPosNotice: (notice: { type: 'error' | 'success'; text: string } | null) => void;
  addProductToCart: (product: Product) => { ok: boolean; message: string };
  addCustomItemToCart: (params: {
    description: string;
    price: number;
    quantity?: number;
  }) => { ok: boolean; message: string; nextCart?: CartItem[] };
  scanBarcodeToCart: (rawCode: string) => { ok: boolean; product?: Product; message: string };
  updateCartQuantity: (productId: string, delta: number) => void;
  setCartItemQuantity: (
    product: Product,
    quantity: number,
    isCustom?: boolean
  ) => { ok: boolean; message: string };
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  // Cross-view receipt viewer trigger
  viewingReceipt: Sale | null;
  setViewingReceipt: (sale: Sale | null) => void;
}

const NexPosContext = createContext<NexPosContextValue | null>(null);

export const NexPosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<WorkspaceMode>('demo');
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [loadingData, setLoadingData] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nexpos_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [viewingReceipt, setViewingReceipt] = useState<Sale | null>(null);

  // Shared POS cart & global barcode scanner mode
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartRef = React.useRef<CartItem[]>([]);
  const [scannerModeActive, setScannerModeActive] = useState<boolean>(false);
  const [posNotice, setPosNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Demo state (purely in-memory, clearly separated from Firebase)
  const [demoRole, setDemoRole] = useState<UserRole>('owner');
  const [demoState, setDemoState] = useState<DemoStoreState>(() => {
    const datasets = createDemoDatasets('demo-owner-01');
    return { activeBusinessId: datasets[0].business.id, datasets };
  });

  // Firebase Live Cloud state
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [liveBusinessId, setLiveBusinessId] = useState<string | null>(null);
  const [liveBusiness, setLiveBusiness] = useState<Business | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [liveLocations, setLiveLocations] = useState<InventoryLocation[]>([]);
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [liveCustomers, setLiveCustomers] = useState<Customer[]>([]);
  const [liveSuppliers, setLiveSuppliers] = useState<Supplier[]>([]);
  const [liveEmployees, setLiveEmployees] = useState<Employee[]>([]);
  const [liveSales, setLiveSales] = useState<Sale[]>([]);
  const [liveMovements, setLiveMovements] = useState<StockMovement[]>([]);
  const [livePurchases, setLivePurchases] = useState<PurchaseOrder[]>([]);

  // Apply theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('nexpos_theme', theme);
  }, [theme]);

  // Boot Firestore connection check & auth listener
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
      return;
    }

    testFirestoreConnection().then(setFirebaseConnected);

    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        try {
          await upsertUserProfile(user, undefined, theme);
          const list = await fetchUserMemberships(user.uid);
          setMemberships(list);
          if (list.length > 0 && !liveBusinessId) {
            setLiveBusinessId(list[0].businessId);
          }
          setMode('firebase');
        } catch (err) {
          setErrorBanner(err instanceof Error ? err.message : 'Unable to load Firebase profile.');
        }
      } else {
        setMemberships([]);
        setLiveBusinessId(null);
        setLiveBusiness(null);
        setMode('demo');
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live Firestore subscriptions when in firebase mode + active business
  useEffect(() => {
    if (mode !== 'firebase' || !authUser || !liveBusinessId) {
      setLoadingData(false);
      return;
    }

    const membership = memberships.find((m) => m.businessId === liveBusinessId);
    const role: UserRole = membership?.role ?? 'cashier';
    setLoadingData(true);

    const unsub = subscribeToBusinessWorkspace(liveBusinessId, role, {
      onBusiness: (biz) => {
        setLiveBusiness(biz);
        setLoadingData(false);
      },
      onCategories: setLiveCategories,
      onLocations: setLiveLocations,
      onProducts: setLiveProducts,
      onCustomers: setLiveCustomers,
      onSuppliers: setLiveSuppliers,
      onEmployees: setLiveEmployees,
      onSales: setLiveSales,
      onMovements: setLiveMovements,
      onPurchases: setLivePurchases,
      onError: (err) => {
        setLoadingData(false);
        setErrorBanner(err.message);
      },
    });

    return () => unsub();
  }, [mode, authUser, liveBusinessId, memberships]);

  const activeDemoDataset = useMemo(
    () =>
      demoState.datasets.find((d) => d.business.id === demoState.activeBusinessId) ??
      demoState.datasets[0],
    [demoState]
  );

  const activeBusiness = mode === 'firebase' ? liveBusiness : activeDemoDataset.business;
  const rawCategories = mode === 'firebase' ? liveCategories : activeDemoDataset.categories;
  const categories = useMemo(
    () =>
      [...rawCategories].sort((a, b) => {
        const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
      }),
    [rawCategories]
  );
  const locations = mode === 'firebase' ? liveLocations : activeDemoDataset.locations;
  const products = mode === 'firebase' ? liveProducts : activeDemoDataset.products;
  const customers = mode === 'firebase' ? liveCustomers : activeDemoDataset.customers;
  const suppliers = mode === 'firebase' ? liveSuppliers : activeDemoDataset.suppliers;
  const employees = mode === 'firebase' ? liveEmployees : activeDemoDataset.employees;
  const sales = mode === 'firebase' ? liveSales : activeDemoDataset.sales;
  const stockMovements = mode === 'firebase' ? liveMovements : activeDemoDataset.stockMovements;
  const purchases = mode === 'firebase' ? livePurchases : activeDemoDataset.purchases;

  const currentRole: UserRole = useMemo(() => {
    if (mode === 'demo') return demoRole;
    const m = memberships.find((item) => item.businessId === liveBusinessId);
    return m?.role ?? 'owner';
  }, [mode, demoRole, memberships, liveBusinessId]);

  const currentUserName =
    mode === 'firebase' && authUser
      ? authUser.displayName || authUser.email || 'NexPOS User'
      : 'Elena Wijesekera';
  const currentUserEmail =
    mode === 'firebase' && authUser
      ? authUser.email || ''
      : 'elena@ceylonroastery.lk';
  const currentUserAvatar =
    mode === 'firebase' && authUser?.photoURL ? authUser.photoURL : DEMO_AVATAR_URL;
  const currentUserId = mode === 'firebase' && authUser ? authUser.uid : 'demo-owner-01';

  const can = useCallback(
    (permission: Permission) => hasPermission(currentRole, permission),
    [currentRole]
  );

  // Guard restricted sections when role changes (e.g., switching to Cashier)
  useEffect(() => {
    if (activeSection === 'settings' && !can('manage_settings')) {
      setActiveSection('pos');
    } else if (activeSection === 'employees' && !can('manage_employees')) {
      setActiveSection('dashboard');
    } else if (activeSection === 'suppliers' && !can('manage_suppliers')) {
      setActiveSection('dashboard');
    } else if (activeSection === 'purchases' && !can('manage_purchases')) {
      setActiveSection('dashboard');
    } else if (activeSection === 'reports' && !can('view_reports')) {
      setActiveSection('dashboard');
    }
  }, [activeSection, can]);

  const businesses = useMemo(() => {
    if (mode === 'firebase') {
      return memberships.map((m) => ({
        id: m.businessId,
        name: m.businessName,
        role: m.role,
      }));
    }
    return demoState.datasets.map((d) => ({
      id: d.business.id,
      name: d.business.name,
      role: demoRole,
    }));
  }, [mode, memberships, demoState.datasets, demoRole]);

  const notifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];
    const lowStock = products.filter((p) => p.active && p.stockQuantity <= p.minStockLevel);
    lowStock.slice(0, 4).forEach((p) => {
      list.push({
        id: `notif-low-${p.id}`,
        title: `Low stock: ${p.name}`,
        detail: `${p.stockQuantity} left (min ${p.minStockLevel})`,
        severity: p.stockQuantity === 0 ? 'alert' : 'warning',
        timestamp: p.updatedAt,
        targetSection: 'inventory',
      });
    });

    sales.slice(0, 3).forEach((s) => {
      list.push({
        id: `notif-sale-${s.id}`,
        title: `Sale ${s.receiptNumber}`,
        detail: `${s.items.length} item(s) via ${s.paymentMethod}`,
        severity: 'info',
        timestamp: s.createdAt,
        targetSection: 'sales',
      });
    });

    return list;
  }, [products, sales]);

  const updateDemoActive = useCallback(
    (updater: (ds: ReturnType<typeof createDemoDatasets>[number]) => ReturnType<typeof createDemoDatasets>[number]) => {
      setDemoState((prev) => ({
        ...prev,
        datasets: prev.datasets.map((d) =>
          d.business.id === prev.activeBusinessId ? updater(d) : d
        ),
      }));
    },
    []
  );

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const setTheme = useCallback((t: 'light' | 'dark') => {
    setThemeState(t);
  }, []);

  const clearCart = useCallback(() => {
    cartRef.current = [];
    setCart([]);
  }, []);

  const toggleScannerMode = useCallback(() => {
    setScannerModeActive((prev) => !prev);
  }, []);

  const switchBusiness = useCallback(
    (businessId: string) => {
      clearCart();
      setPosNotice(null);
      if (mode === 'firebase') {
        setLiveBusinessId(businessId);
      } else {
        setDemoState((prev) => ({ ...prev, activeBusinessId: businessId }));
      }
    },
    [mode, clearCart]
  );

  const createBusiness = useCallback(
    async (
      input: {
        name: string;
        businessType: BusinessType;
        currency: CurrencyCode;
        taxRate: number;
        address?: string;
        phone?: string;
        email?: string;
      },
      seedSample: boolean
    ) => {
      const now = new Date().toISOString();
      if (mode === 'firebase') {
        if (!authUser) throw new Error('Sign in with Google to create a cloud workspace.');
        const newBizId = await createBusinessInFirestore(authUser, input, seedSample);
        const list = await fetchUserMemberships(authUser.uid);
        setMemberships(list);
        setLiveBusinessId(newBizId);
        return;
      }

      const newBizId = generateId('biz');
      const locId = generateId('loc');
      const seed = seedSample ? createDemoDatasets('demo-owner-01')[0] : null;
      const newDataset: ReturnType<typeof createDemoDatasets>[number] = {
        business: {
          id: newBizId,
          name: input.name.trim(),
          businessType: input.businessType,
          ownerUid: 'demo-owner-01',
          address: input.address,
          phone: input.phone,
          email: input.email,
          currency: input.currency,
          taxRate: input.taxRate,
          receiptHeader: `Welcome to ${input.name.trim()}`,
          receiptFooter: 'Thank you for your business.',
          createdAt: now,
          updatedAt: now,
        },
        locations: [
          {
            id: locId,
            businessId: newBizId,
            name: 'Main Storefront',
            address: input.address,
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
        categories: seed
          ? seed.categories.map((c) => ({ ...c, businessId: newBizId }))
          : [
              {
                id: generateId('cat'),
                businessId: newBizId,
                name: 'General',
                description: 'Default product category',
                color: '#2563EB',
                active: true,
                sortOrder: 0,
                createdAt: now,
                updatedAt: now,
              },
            ],
        products: seed ? seed.products.map((p) => ({ ...p, businessId: newBizId, locationId: locId })) : [],
        customers: seed ? seed.customers.map((c) => ({ ...c, businessId: newBizId })) : [],
        suppliers: seed ? seed.suppliers.map((s) => ({ ...s, businessId: newBizId })) : [],
        employees: [
          {
            uid: 'demo-owner-01',
            businessId: newBizId,
            name: 'Elena Wijesekera',
            email: 'elena@ceylonroastery.lk',
            role: 'owner',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        ],
        sales: [],
        stockMovements: [],
        purchases: [],
      };
      setDemoState((prev) => ({
        activeBusinessId: newBizId,
        datasets: [newDataset, ...prev.datasets],
      }));
    },
    [mode, authUser]
  );

  const signInWithGoogle = useCallback(async () => {
    setErrorBanner(null);
    const cred = await signInWithGooglePopup();
    if (cred.user) {
      await upsertUserProfile(cred.user, undefined, theme);
      const list = await fetchUserMemberships(cred.user.uid);
      setMemberships(list);
      if (list.length > 0) {
        setLiveBusinessId(list[0].businessId);
      }
      setMode('firebase');
    }
  }, [theme]);

  const signOutToDemo = useCallback(async () => {
    await signOutFirebase();
    setMode('demo');
  }, []);

  const switchToDemoMode = useCallback(() => {
    setMode('demo');
  }, []);

  const resetDemoData = useCallback(() => {
    const datasets = createDemoDatasets('demo-owner-01');
    setDemoState({ activeBusinessId: datasets[0].business.id, datasets });
    clearCart();
    setPosNotice(null);
  }, [clearCart]);

  const addProductToCart = useCallback((product: Product): { ok: boolean; message: string } => {
    if (!product.active) {
      const message = `"${product.name}" is inactive and cannot be added to cart.`;
      setPosNotice({ type: 'error', text: message });
      return { ok: false, message };
    }
    if (product.stockQuantity <= 0) {
      const message = `"${product.name}" is out of stock.`;
      setPosNotice({ type: 'error', text: message });
      return { ok: false, message };
    }

    const currentCart = cartRef.current;
    const existing = currentCart.find((item) => item.product.id === product.id);
    if (existing) {
      if (existing.quantity + 1 > product.stockQuantity) {
        const message = `Maximum available stock (${product.stockQuantity}) reached for "${product.name}".`;
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }
      const next = currentCart.map((item) =>
        item.product.id === product.id
          ? { ...item, product, quantity: item.quantity + 1 }
          : item
      );
      cartRef.current = next;
      setCart(next);
      setPosNotice(null);
      return { ok: true, message: `Added ${product.name} (qty ${existing.quantity + 1})` };
    }

    const next = [...currentCart, { product, quantity: 1 }];
    cartRef.current = next;
    setCart(next);
    setPosNotice(null);
    return { ok: true, message: `Added ${product.name} to POS cart` };
  }, []);

  const addCustomItemToCart = useCallback(
    (params: {
      description: string;
      price: number;
      quantity?: number;
    }): { ok: boolean; message: string; nextCart?: CartItem[] } => {
      const desc = params.description.trim().slice(0, 140);
      if (!desc) {
        const message = 'Please enter a description for the custom Quick Sale item.';
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }
      const price = roundMoney(Number(params.price));
      if (!Number.isFinite(price) || price <= 0) {
        const message = 'Please enter a valid custom price greater than 0.';
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }
      const quantity = Math.max(1, Math.floor(Number(params.quantity) || 1));
      const now = new Date().toISOString();
      const customId = generateId('custom');
      const syntheticProduct: Product = {
        id: customId,
        businessId: activeBusiness?.id ?? '',
        name: desc,
        categoryId: 'custom',
        sku: 'CUSTOM',
        purchasePrice: 0,
        sellingPrice: price,
        stockQuantity: Number.MAX_SAFE_INTEGER,
        minStockLevel: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      };

      const next = [...cartRef.current, { product: syntheticProduct, quantity, isCustom: true }];
      cartRef.current = next;
      setCart(next);
      setPosNotice(null);
      return {
        ok: true,
        message: `Added custom item "${desc}" to POS cart`,
        nextCart: next,
      };
    },
    [activeBusiness?.id]
  );

  const scanBarcodeToCart = useCallback(
    (rawCode: string): { ok: boolean; product?: Product; message: string } => {
      const trimmed = rawCode.trim();
      const code = trimmed.toLowerCase();
      if (!code) {
        return { ok: false, message: 'Empty barcode input.' };
      }

      const match = products.find(
        (p) =>
          p.active &&
          ((p.barcode && p.barcode.toLowerCase() === code) || p.sku.toLowerCase() === code)
      );

      if (!match) {
        const message = `No active product matched code "${trimmed}".`;
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }

      const res = addProductToCart(match);
      if (res.ok) {
        const message = `Scanned "${match.name}" into POS cart`;
        setPosNotice({ type: 'success', text: message });
        return { ok: true, product: match, message };
      }
      return { ok: false, product: match, message: res.message };
    },
    [products, addProductToCart]
  );

  const updateCartQuantity = useCallback((productId: string, delta: number) => {
    setPosNotice(null);
    const currentCart = cartRef.current;
    const target = currentCart.find((item) => item.product.id === productId);
    if (!target) return;

    const nextQty = target.quantity + delta;
    if (!target.isCustom && nextQty > target.product.stockQuantity) {
      setPosNotice({
        type: 'error',
        text: `Only ${target.product.stockQuantity} units available for "${target.product.name}".`,
      });
      return;
    }

    const next = currentCart
      .map((item) => {
        if (item.product.id !== productId) return item;
        if (nextQty <= 0) return null;
        return { ...item, quantity: nextQty };
      })
      .filter((x): x is CartItem => x !== null);

    cartRef.current = next;
    setCart(next);
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    const next = cartRef.current.filter((item) => item.product.id !== productId);
    cartRef.current = next;
    setCart(next);
  }, []);

  const setCartItemQuantity = useCallback(
    (
      product: Product,
      quantity: number,
      isCustom?: boolean
    ): { ok: boolean; message: string } => {
      const safeQty = Math.max(0, Math.floor(Number(quantity) || 0));
      const currentCart = cartRef.current;
      const existing = currentCart.find((item) => item.product.id === product.id);
      const effectiveCustom = Boolean(isCustom ?? existing?.isCustom);

      if (safeQty === 0) {
        if (!existing) {
          setPosNotice(null);
          return { ok: true, message: `${product.name} not in cart.` };
        }
        const next = currentCart.filter((item) => item.product.id !== product.id);
        cartRef.current = next;
        setCart(next);
        setPosNotice(null);
        return { ok: true, message: `Removed ${product.name} from cart` };
      }

      if (!effectiveCustom && product.stockQuantity <= 0) {
        const message = `"${product.name}" is out of stock.`;
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }

      if (!effectiveCustom && safeQty > product.stockQuantity) {
        const message = `Only ${product.stockQuantity} units available for "${product.name}".`;
        setPosNotice({ type: 'error', text: message });
        return { ok: false, message };
      }

      const next = existing
        ? currentCart.map((item) =>
            item.product.id === product.id
              ? { ...item, product, quantity: safeQty }
              : item
          )
        : [...currentCart, { product, quantity: safeQty, isCustom: effectiveCustom || undefined }];

      cartRef.current = next;
      setCart(next);
      setPosNotice(null);
      return { ok: true, message: `Set ${product.name} quantity to ${safeQty}` };
    },
    []
  );

  const saveProduct = useCallback(
    async (input: Omit<Product, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!activeBusiness) return;
      const isNew = !input.id;
      const id = input.id ?? generateId('prod');
      const now = new Date().toISOString();

      if (mode === 'firebase') {
        await saveProductInFirestore(activeBusiness.id, { ...input, id, businessId: activeBusiness.id }, isNew);
        return;
      }

      updateDemoActive((ds) => {
        if (isNew) {
          const created: Product = {
            ...input,
            id,
            businessId: ds.business.id,
            createdAt: now,
            updatedAt: now,
          };
          return { ...ds, products: [created, ...ds.products] };
        }
        return {
          ...ds,
          products: ds.products.map((p) =>
            p.id === id ? { ...p, ...input, id, updatedAt: now } : p
          ),
        };
      });
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const deleteProduct = useCallback(
    async (productId: string) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await deleteProductInFirestore(activeBusiness.id, productId);
        return;
      }
      updateDemoActive((ds) => ({
        ...ds,
        products: ds.products.filter((p) => p.id !== productId),
      }));
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const saveCategory = useCallback(
    async (input: Omit<Category, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!activeBusiness) return;
      const isNew = !input.id;
      const id = input.id ?? generateId('cat');
      const now = new Date().toISOString();
      const existing = categories.find((c) => c.id === id);
      const nextSortOrder =
        input.sortOrder !== undefined
          ? input.sortOrder
          : isNew
          ? categories.length
          : existing?.sortOrder;

      if (mode === 'firebase') {
        await saveCategoryInFirestore(
          activeBusiness.id,
          { ...input, id, businessId: activeBusiness.id, sortOrder: nextSortOrder },
          isNew
        );
        return;
      }
      updateDemoActive((ds) => {
        if (isNew) {
          return {
            ...ds,
            categories: [
              ...ds.categories,
              {
                ...input,
                id,
                businessId: ds.business.id,
                sortOrder: nextSortOrder,
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        }
        return {
          ...ds,
          categories: ds.categories.map((c) =>
            c.id === id
              ? { ...c, ...input, id, sortOrder: nextSortOrder ?? c.sortOrder, updatedAt: now }
              : c
          ),
        };
      });
    },
    [activeBusiness, categories, mode, updateDemoActive]
  );

  const reorderCategories = useCallback(
    async (orderedCategoryIds: string[]) => {
      if (!activeBusiness || orderedCategoryIds.length === 0) return;
      const orderById = new Map(orderedCategoryIds.map((id, idx) => [id, idx]));
      const now = new Date().toISOString();

      if (mode === 'firebase') {
        // Optimistic UI update while Firestore batch commit executes
        setLiveCategories((prev) =>
          prev
            .map((c) =>
              orderById.has(c.id) ? { ...c, sortOrder: orderById.get(c.id), updatedAt: now } : c
            )
            .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER))
        );
        await reorderCategoriesInFirestore(activeBusiness.id, orderedCategoryIds);
        return;
      }

      updateDemoActive((ds) => ({
        ...ds,
        categories: ds.categories
          .map((c) =>
            orderById.has(c.id) ? { ...c, sortOrder: orderById.get(c.id), updatedAt: now } : c
          )
          .sort(
            (a, b) =>
              (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
          ),
      }));
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await deleteCategoryInFirestore(activeBusiness.id, categoryId);
        return;
      }
      updateDemoActive((ds) => ({
        ...ds,
        categories: ds.categories.filter((c) => c.id !== categoryId),
      }));
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const saveCustomer = useCallback(
    async (input: Omit<Customer, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!activeBusiness) throw new Error('No active business selected.');
      const isNew = !input.id;
      const id = input.id ?? generateId('cust');
      const now = new Date().toISOString();
      const customerRecord: Customer = {
        ...input,
        id,
        businessId: activeBusiness.id,
        createdAt: now,
        updatedAt: now,
      };

      if (mode === 'firebase') {
        await saveCustomerInFirestore(activeBusiness.id, customerRecord, isNew);
        return customerRecord;
      }

      updateDemoActive((ds) => {
        if (isNew) {
          return { ...ds, customers: [customerRecord, ...ds.customers] };
        }
        return {
          ...ds,
          customers: ds.customers.map((c) =>
            c.id === id ? { ...c, ...input, id, updatedAt: now } : c
          ),
        };
      });
      return customerRecord;
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const saveSupplier = useCallback(
    async (input: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!activeBusiness) return;
      const isNew = !input.id;
      const id = input.id ?? generateId('sup');
      const now = new Date().toISOString();

      if (mode === 'firebase') {
        await saveSupplierInFirestore(activeBusiness.id, { ...input, id, businessId: activeBusiness.id }, isNew);
        return;
      }

      updateDemoActive((ds) => {
        if (isNew) {
          return {
            ...ds,
            suppliers: [
              { ...input, id, businessId: ds.business.id, createdAt: now, updatedAt: now },
              ...ds.suppliers,
            ],
          };
        }
        return {
          ...ds,
          suppliers: ds.suppliers.map((s) =>
            s.id === id ? { ...s, ...input, id, updatedAt: now } : s
          ),
        };
      });
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const deleteSupplier = useCallback(
    async (supplierId: string) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await deleteSupplierInFirestore(activeBusiness.id, supplierId);
        return;
      }
      updateDemoActive((ds) => ({
        ...ds,
        suppliers: ds.suppliers.filter((s) => s.id !== supplierId),
      }));
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const saveLocation = useCallback(
    async (input: Omit<InventoryLocation, 'id' | 'businessId' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      if (!activeBusiness) return;
      const isNew = !input.id;
      const id = input.id ?? generateId('loc');
      const now = new Date().toISOString();

      if (mode === 'firebase') {
        await saveLocationInFirestore(activeBusiness.id, { ...input, id, businessId: activeBusiness.id }, isNew);
        return;
      }
      updateDemoActive((ds) => {
        const nextList = isNew
          ? [{ ...input, id, businessId: ds.business.id, createdAt: now, updatedAt: now }, ...ds.locations]
          : ds.locations.map((l) => (l.id === id ? { ...l, ...input, id, updatedAt: now } : l));
        return { ...ds, locations: nextList };
      });
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const adjustStock = useCallback(
    async (params: {
      productId: string;
      type: 'in' | 'out' | 'adjustment';
      quantityChange: number;
      reason: string;
      locationId?: string;
    }) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await adjustStockInFirestore(activeBusiness.id, {
          ...params,
          actorUid: currentUserId,
          actorName: currentUserName,
        });
        return;
      }

      const now = new Date().toISOString();
      updateDemoActive((ds) => {
        const target = ds.products.find((p) => p.id === params.productId);
        if (!target) throw new Error('Product not found.');

        const prev = target.stockQuantity;
        let next = prev;
        let delta = 0;
        if (params.type === 'in') {
          delta = Math.abs(Math.floor(params.quantityChange));
          next = prev + delta;
        } else if (params.type === 'out') {
          delta = -Math.abs(Math.floor(params.quantityChange));
          next = prev + delta;
        } else {
          next = Math.max(0, Math.floor(params.quantityChange));
          delta = next - prev;
        }

        if (next < 0) {
          throw new Error(`Insufficient stock. Cannot drop below 0.`);
        }

        const movement: StockMovement = {
          id: generateId('mov'),
          businessId: ds.business.id,
          productId: target.id,
          productName: target.name,
          locationId: params.locationId ?? target.locationId,
          type: params.type,
          quantityDelta: delta,
          previousStock: prev,
          newStock: next,
          reason: params.reason.trim(),
          actorUid: currentUserId,
          actorName: currentUserName,
          createdAt: now,
        };

        return {
          ...ds,
          products: ds.products.map((p) =>
            p.id === target.id ? { ...p, stockQuantity: next, updatedAt: now } : p
          ),
          stockMovements: [movement, ...ds.stockMovements],
        };
      });
    },
    [activeBusiness, mode, currentUserId, currentUserName, updateDemoActive]
  );

  const completeSale = useCallback(
    async (params: {
      items: SaleItem[];
      customerId?: string;
      customerName?: string;
      locationId?: string;
      subtotal: number;
      discountType?: 'fixed' | 'percent';
      discountValue?: number;
      discountAmount: number;
      taxRate: number;
      taxAmount: number;
      grandTotal: number;
      paymentMethod: PaymentMethod;
      amountTendered: number;
      changeDue: number;
      paymentReference?: string;
    }): Promise<Sale> => {
      if (!activeBusiness) throw new Error('No active business selected.');
      const now = new Date().toISOString();
      const saleId = generateId('sale');
      const receiptNumber = `NX-${new Date().getFullYear()}-${saleId.slice(-6).toUpperCase()}`;

      const saleRecord: Sale = {
        id: saleId,
        businessId: activeBusiness.id,
        receiptNumber,
        customerId: params.customerId,
        customerName: params.customerName,
        cashierUid: currentUserId,
        cashierName: currentUserName,
        locationId: params.locationId ?? locations.find((l) => l.isDefault)?.id,
        items: params.items,
        subtotal: params.subtotal,
        discountType: params.discountType,
        discountValue: params.discountValue,
        discountAmount: params.discountAmount,
        taxRate: params.taxRate,
        taxAmount: params.taxAmount,
        grandTotal: params.grandTotal,
        paymentMethod: params.paymentMethod,
        amountTendered: params.amountTendered,
        changeDue: params.changeDue,
        paymentReference: params.paymentReference,
        status: 'completed',
        createdAt: now,
      };

      if (mode === 'firebase') {
        // The trusted API recalculates prices, tax, discounts and stock from
        // current Firestore records. Use its persisted sale for the receipt.
        return await executeSaleTransactionInFirestore(activeBusiness.id, saleRecord);
      }

      // Demo mode atomic validation & update
      updateDemoActive((ds) => {
        const soldByProduct = new Map<string, SaleItem>();
        for (const item of params.items) {
          if (item.isCustom) continue;
          const existing = soldByProduct.get(item.productId);
          soldByProduct.set(
            item.productId,
            existing ? { ...existing, quantity: existing.quantity + item.quantity } : { ...item }
          );
        }
        const inventoriedItems = [...soldByProduct.values()];
        for (const item of inventoriedItems) {
          const prod = ds.products.find((p) => p.id === item.productId);
          if (!prod) throw new Error(`Product ${item.name} not found.`);
          if (prod.stockQuantity < item.quantity) {
            throw new Error(
              `Insufficient stock for ${prod.name}. Available: ${prod.stockQuantity}.`
            );
          }
        }

        const newMovements: StockMovement[] = [];
        const updatedProducts = ds.products.map((p) => {
          const sold = soldByProduct.get(p.id);
          if (!sold) return p;
          const nextStock = p.stockQuantity - sold.quantity;
          newMovements.push({
            id: generateId('mov'),
            businessId: ds.business.id,
            productId: p.id,
            productName: p.name,
            locationId: p.locationId,
            type: 'sale',
            quantityDelta: -sold.quantity,
            previousStock: p.stockQuantity,
            newStock: nextStock,
            reason: `POS Sale ${receiptNumber}`,
            referenceId: saleId,
            actorUid: currentUserId,
            actorName: currentUserName,
            createdAt: now,
          });
          return { ...p, stockQuantity: nextStock, updatedAt: now };
        });

        const updatedCustomers = params.customerId
          ? ds.customers.map((c) =>
              c.id === params.customerId
                ? {
                    ...c,
                    totalSpent: roundMoney(c.totalSpent + params.grandTotal),
                    ordersCount: c.ordersCount + 1,
                    lastPurchaseAt: now,
                    updatedAt: now,
                  }
                : c
            )
          : ds.customers;

        return {
          ...ds,
          products: updatedProducts,
          customers: updatedCustomers,
          sales: [saleRecord, ...ds.sales],
          stockMovements: [...newMovements, ...ds.stockMovements],
        };
      });

      return saleRecord;
    },
    [activeBusiness, sales.length, currentUserId, currentUserName, locations, mode, updateDemoActive]
  );

  const refundSale = useCallback(
    async (saleId: string) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await refundSaleInFirestore(activeBusiness.id, saleId, currentUserId, currentUserName);
        return;
      }

      const now = new Date().toISOString();
      updateDemoActive((ds) => {
        const sale = ds.sales.find((item) => item.id === saleId);
        if (!sale || sale.status !== 'completed') return ds;

        const refundedItems = sale.items.filter((item) => !item.isCustom);
        const movements: StockMovement[] = [];
        const updatedProducts = ds.products.map((product) => {
          const returnedQty = refundedItems
            .filter((item) => item.productId === product.id)
            .reduce((sum, item) => sum + item.quantity, 0);
          if (returnedQty === 0) return product;

          const nextStock = product.stockQuantity + returnedQty;
          movements.push({
            id: generateId('mov'),
            businessId: ds.business.id,
            productId: product.id,
            productName: product.name,
            locationId: product.locationId,
            type: 'in',
            quantityDelta: returnedQty,
            previousStock: product.stockQuantity,
            newStock: nextStock,
            reason: `Refund ${sale.receiptNumber}`,
            referenceId: sale.id,
            actorUid: currentUserId,
            actorName: currentUserName,
            createdAt: now,
          });
          return { ...product, stockQuantity: nextStock, updatedAt: now };
        });

        const updatedCustomers = sale.customerId
          ? ds.customers.map((customer) =>
              customer.id === sale.customerId
                ? {
                    ...customer,
                    totalSpent: roundMoney(Math.max(0, customer.totalSpent - sale.grandTotal)),
                    ordersCount: Math.max(0, customer.ordersCount - 1),
                    updatedAt: now,
                  }
                : customer
            )
          : ds.customers;

        return {
          ...ds,
          products: updatedProducts,
          customers: updatedCustomers,
          stockMovements: [...movements, ...ds.stockMovements],
          sales: ds.sales.map((item) =>
            item.id === saleId ? { ...item, status: 'refunded' } : item
          ),
        };
      });
    },
    [activeBusiness, mode, updateDemoActive, currentUserId, currentUserName]
  );

  const createPurchaseOrder = useCallback(
    async (params: {
      supplierId: string;
      supplierName: string;
      locationId?: string;
      items: PurchaseItem[];
    }) => {
      if (!activeBusiness) return;
      const now = new Date().toISOString();
      const id = generateId('po');
      const totalCost = roundMoney(params.items.reduce((sum, i) => sum + i.lineTotal, 0));
      const po: PurchaseOrder = {
        id,
        businessId: activeBusiness.id,
        purchaseNumber: `PO-${new Date().getFullYear()}-${id.slice(-6).toUpperCase()}`,
        supplierId: params.supplierId,
        supplierName: params.supplierName,
        locationId: params.locationId ?? locations.find((l) => l.isDefault)?.id,
        items: params.items,
        totalCost,
        status: 'ordered',
        createdByUid: currentUserId,
        createdAt: now,
        updatedAt: now,
      };

      if (mode === 'firebase') {
        await createPurchaseOrderInFirestore(activeBusiness.id, po);
        return;
      }

      updateDemoActive((ds) => ({
        ...ds,
        purchases: [po, ...ds.purchases],
      }));
    },
    [activeBusiness, purchases.length, locations, currentUserId, mode, updateDemoActive]
  );

  const receivePurchaseOrder = useCallback(
    async (purchaseId: string) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await receivePurchaseOrderInFirestore(
          activeBusiness.id,
          purchaseId,
          currentUserId,
          currentUserName
        );
        return;
      }

      const now = new Date().toISOString();
      updateDemoActive((ds) => {
        const po = ds.purchases.find((p) => p.id === purchaseId);
        if (!po || po.status !== 'ordered') return ds;

        const movements: StockMovement[] = [];
        const nextProducts = ds.products.map((prod) => {
          const item = po.items.find((i) => i.productId === prod.id);
          if (!item) return prod;
          const nextStock = prod.stockQuantity + item.quantity;
          movements.push({
            id: generateId('mov'),
            businessId: ds.business.id,
            productId: prod.id,
            productName: prod.name,
            locationId: po.locationId ?? prod.locationId,
            type: 'purchase',
            quantityDelta: item.quantity,
            previousStock: prod.stockQuantity,
            newStock: nextStock,
            reason: `Received Purchase ${po.purchaseNumber}`,
            referenceId: po.id,
            actorUid: currentUserId,
            actorName: currentUserName,
            createdAt: now,
          });
          return { ...prod, stockQuantity: nextStock, updatedAt: now };
        });

        return {
          ...ds,
          products: nextProducts,
          stockMovements: [...movements, ...ds.stockMovements],
          purchases: ds.purchases.map((p) =>
            p.id === purchaseId ? { ...p, status: 'received', updatedAt: now } : p
          ),
        };
      });
    },
    [activeBusiness, mode, currentUserId, currentUserName, updateDemoActive]
  );

  const saveEmployee = useCallback(
    async (emp: Omit<Employee, 'businessId' | 'createdAt' | 'updatedAt'>) => {
      if (!activeBusiness) return;
      const isNew = !employees.some((e) => e.uid === emp.uid);
      const now = new Date().toISOString();

      if (mode === 'firebase') {
        await saveEmployeeInFirestore(
          activeBusiness.id,
          { ...emp, businessId: activeBusiness.id },
          isNew
        );
        return;
      }

      updateDemoActive((ds) => {
        if (isNew) {
          return {
            ...ds,
            employees: [
              ...ds.employees,
              { ...emp, businessId: ds.business.id, createdAt: now, updatedAt: now },
            ],
          };
        }
        return {
          ...ds,
          employees: ds.employees.map((e) =>
            e.uid === emp.uid ? { ...e, ...emp, updatedAt: now } : e
          ),
        };
      });
    },
    [activeBusiness, employees, mode, updateDemoActive]
  );

  const updateBusinessSettings = useCallback(
    async (
      updates: Partial<
        Pick<
          Business,
          | 'name'
          | 'businessType'
          | 'logoUrl'
          | 'address'
          | 'phone'
          | 'email'
          | 'currency'
          | 'taxRate'
          | 'receiptHeader'
          | 'receiptFooter'
          | 'lowStockAlertEnabled'
          | 'lowStockAlertEmail'
          | 'lowStockAlertTime'
        >
      >
    ) => {
      if (!activeBusiness) return;
      if (mode === 'firebase') {
        await updateBusinessSettingsInFirestore(activeBusiness.id, updates);
        return;
      }
      const now = new Date().toISOString();
      updateDemoActive((ds) => ({
        ...ds,
        business: { ...ds.business, ...updates, updatedAt: now },
      }));
    },
    [activeBusiness, mode, updateDemoActive]
  );

  const value: NexPosContextValue = {
    mode,
    firebaseAvailable: isFirebaseConfigured,
    firebaseConnected,
    authUser,
    authReady,
    loadingData,
    errorBanner,
    clearError: () => setErrorBanner(null),
    theme,
    toggleTheme,
    setTheme,
    activeSection,
    setActiveSection,
    currentUserName,
    currentUserEmail,
    currentUserAvatar,
    currentRole,
    setDemoRole,
    can,
    businesses,
    activeBusiness,
    switchBusiness,
    createBusiness,
    signInWithGoogle,
    signOutToDemo,
    switchToDemoMode,
    resetDemoData,
    categories,
    locations,
    products,
    customers,
    suppliers,
    employees,
    sales,
    stockMovements,
    purchases,
    notifications,
    saveProduct,
    deleteProduct,
    saveCategory,
    reorderCategories,
    deleteCategory,
    saveCustomer,
    saveSupplier,
    deleteSupplier,
    saveLocation,
    adjustStock,
    completeSale,
    refundSale,
    createPurchaseOrder,
    receivePurchaseOrder,
    saveEmployee,
    updateBusinessSettings,
    cart,
    scannerModeActive,
    setScannerModeActive,
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
    viewingReceipt,
    setViewingReceipt,
  };

  return <NexPosContext.Provider value={value}>{children}</NexPosContext.Provider>;
};

export function useNexPos(): NexPosContextValue {
  const ctx = useContext(NexPosContext);
  if (!ctx) {
    throw new Error('useNexPos must be used within a NexPosProvider');
  }
  return ctx;
}
