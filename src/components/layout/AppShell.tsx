import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cloud,
  CreditCard,
  FolderTree,
  Globe,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useNexPos } from '../../context/NexPosContext';
import { TranslationKey } from '../../i18n/translations';
import {
  REGION_PRESETS,
  RegionLocaleId,
  SUPPORTED_LANGUAGES,
  TimeCyclePreference,
} from '../../i18n/types';
import { NavSection, Permission, UserRole } from '../../types/nexpos';
import { CreateBusinessModal } from '../common/CreateBusinessModal';
import { haptics } from '../../utils/haptics';

interface NavItemConfig {
  id: NavSection;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  permission: Permission;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'view_dashboard' },
  { id: 'pos', labelKey: 'nav.pos', icon: CreditCard, permission: 'use_pos' },
  { id: 'products', labelKey: 'nav.products', icon: Package, permission: 'view_dashboard' },
  { id: 'categories', labelKey: 'nav.categories', icon: FolderTree, permission: 'view_dashboard' },
  { id: 'inventory', labelKey: 'nav.inventory', icon: Boxes, permission: 'view_dashboard' },
  { id: 'customers', labelKey: 'nav.customers', icon: Users, permission: 'view_dashboard' },
  { id: 'suppliers', labelKey: 'nav.suppliers', icon: Truck, permission: 'manage_suppliers' },
  { id: 'purchases', labelKey: 'nav.purchases', icon: ShoppingBag, permission: 'manage_purchases' },
  { id: 'sales', labelKey: 'nav.sales', icon: Receipt, permission: 'view_dashboard' },
  { id: 'employees', labelKey: 'nav.employees', icon: UserCheck, permission: 'manage_employees' },
  { id: 'reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'view_reports' },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings, permission: 'manage_settings' },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    mode,
    firebaseAvailable,
    authUser,
    errorBanner,
    clearError,
    theme,
    toggleTheme,
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
    signInWithGoogle,
    signOutToDemo,
    resetDemoData,
    products,
    customers,
    sales,
    notifications,
    setViewingReceipt,
    cart,
    scannerModeActive,
    toggleScannerMode,
    scanBarcodeToCart,
  } = useNexPos();

  const {
    language,
    languageMeta,
    isRtl,
    regionLocale,
    timeCycle,
    setLanguage,
    setRegionLocale,
    setTimeCycle,
    t,
    formatMoney,
    formatDateTime,
  } = useI18n();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showBusinessMenu, setShowBusinessMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showCreateBizModal, setShowCreateBizModal] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [authLoading, setAuthLoading] = useState(false);
  const [scannerToast, setScannerToast] = useState<{
    id: number;
    ok: boolean;
    text: string;
    code: string;
  } | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const bizRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const scanBufferRef = useRef('');
  const lastScanKeyAtRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const targetNode = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(targetNode)) setSearchFocused(false);
      if (notifRef.current && !notifRef.current.contains(targetNode)) setShowNotifMenu(false);
      if (bizRef.current && !bizRef.current.contains(targetNode)) setShowBusinessMenu(false);
      if (profileRef.current && !profileRef.current.contains(targetNode)) setShowProfileMenu(false);
      if (langRef.current && !langRef.current.contains(targetNode)) setShowLangMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Global keyboard barcode scanner listener
  useEffect(() => {
    if (!scannerModeActive || !activeBusiness || !can('use_pos')) {
      scanBufferRef.current = '';
      lastScanKeyAtRef.current = 0;
      return;
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const nowMs = Date.now();
      if (nowMs - lastScanKeyAtRef.current > 1500) {
        scanBufferRef.current = '';
      }

      if (e.key === 'Escape') {
        scanBufferRef.current = '';
        return;
      }

      if (e.key === 'Backspace') {
        if (scanBufferRef.current.length > 0) {
          scanBufferRef.current = scanBufferRef.current.slice(0, -1);
          lastScanKeyAtRef.current = nowMs;
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Enter') {
        const code = scanBufferRef.current.trim();
        scanBufferRef.current = '';
        if (code.length >= 2) {
          e.preventDefault();
          const result = scanBarcodeToCart(code);
          if (result.ok) {
            haptics.success();
          } else {
            haptics.warning();
          }
          setScannerToast({
            id: nowMs,
            ok: result.ok,
            text: result.message,
            code,
          });
        }
        return;
      }

      if (e.key.length === 1) {
        if (scanBufferRef.current.length === 0 && e.key === ' ') return;
        scanBufferRef.current += e.key;
        lastScanKeyAtRef.current = nowMs;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [scannerModeActive, activeBusiness, can, scanBarcodeToCart]);

  useEffect(() => {
    if (!scannerToast) return;
    const timer = setTimeout(() => setScannerToast(null), 3500);
    return () => clearTimeout(timer);
  }, [scannerToast]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { products: [], customers: [], sales: [] };
    return {
      products: products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.toLowerCase().includes(q))
        )
        .slice(0, 4),
      customers: customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.toLowerCase().includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
        )
        .slice(0, 3),
      sales: sales
        .filter(
          (s) =>
            s.receiptNumber.toLowerCase().includes(q) ||
            (s.customerName && s.customerName.toLowerCase().includes(q))
        )
        .slice(0, 3),
    };
  }, [searchQuery, products, customers, sales]);

  const hasSearchHits =
    searchResults.products.length > 0 ||
    searchResults.customers.length > 0 ||
    searchResults.sales.length > 0;

  const visibleNavItems = NAV_ITEMS.filter((item) => can(item.permission));
  const activeNavMeta = NAV_ITEMS.find((i) => i.id === activeSection) ?? NAV_ITEMS[0];
  const getRoleLabel = (role: UserRole) => t(`roles.${role}` as TranslationKey);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      setShowProfileMenu(false);
    } catch {
      // handled in context
    } finally {
      setAuthLoading(false);
    }
  };

  const formattedClock = formatDateTime(now, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const renderSidebarNav = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#0B1220] text-slate-200 select-none">
      {/* Brand Mark */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            setActiveSection('dashboard');
            if (isMobile) setMobileOpen(false);
          }}
          className="flex items-center gap-2.5 text-left cursor-pointer min-w-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0">
            N
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight text-white leading-tight">
                NexPOS
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                One Platform. Every Transaction.
              </div>
            </div>
          )}
        </button>

        {!isMobile ? (
          <button
            type="button"
            onClick={() => {
              haptics.light();
              setCollapsed((c) => !c);
            }}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
              {collapsed ? (
                isRtl ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              ) : isRtl ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.light();
                setMobileOpen(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const label = t(item.labelKey);
            const lowStockCount =
              item.id === 'inventory'
                ? products.filter((p) => p.active && p.stockQuantity <= p.minStockLevel).length
                : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setActiveSection(item.id);
                  if (isMobile) setMobileOpen(false);
                }}
                title={
                  collapsed && !isMobile
                    ? lowStockCount > 0
                      ? `${label} (${lowStockCount})`
                      : label
                    : undefined
                }
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                } ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {(!collapsed || isMobile) && (
                  <>
                    <span className="truncate flex-1 text-start">{label}</span>
                    {lowStockCount > 0 && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums shrink-0 ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {lowStockCount}
                      </span>
                    )}
                  </>
                )}
                {collapsed && !isMobile && lowStockCount > 0 && (
                  <span className="absolute top-1.5 end-1.5 min-w-[16px] h-4 px-1 rounded-md bg-amber-500 text-slate-950 text-[10px] font-mono font-bold tabular-nums flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Workspace status footer */}
        <div className="p-3 border-t border-slate-800/80 shrink-0">
          {(!collapsed || isMobile) ? (
            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-400 font-medium truncate">
                  {mode === 'firebase' ? t('topbar.cloudConnected') : t('topbar.demoMode')}
                </span>
                <span className="text-slate-300 font-mono truncate">{getRoleLabel(currentRole)}</span>
              </div>
              {mode === 'demo' ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {t('topbar.demoBanner')}
                  </p>
                  {firebaseAvailable && (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={authLoading}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      {authLoading ? t('common.loading') : t('topbar.syncGoogle')}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 leading-relaxed truncate">
                  {authUser?.email}
                </p>
              )}
            </div>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title={mode === 'firebase' ? 'Cloud Firestore Connected' : 'Demo Sandbox Mode'}
            className="w-full flex items-center justify-center p-2 rounded-xl bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
          >
            <Cloud className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-e border-slate-200 dark:border-slate-800 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {renderSidebarNav(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">
            {renderSidebarNav(true)}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="h-16 sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
          {/* Left: Mobile Trigger + Breadcrumb + Business Selector */}
          <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label={t('topbar.openSidebar')}
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {t(activeNavMeta.labelKey)}
                </span>
              </div>

              {/* Business Selector */}
              <div className="relative" ref={bizRef}>
                <button
                  type="button"
                  onClick={() => setShowBusinessMenu((s) => !s)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer max-w-[200px]"
                >
                  <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">
                    {activeBusiness ? activeBusiness.name : t('topbar.businessSwitcher')}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {showBusinessMenu && (
                  <div className="absolute start-0 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-50">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400">
                      {t('topbar.businessSwitcher')} ({mode === 'firebase' ? t('topbar.cloudConnected') : t('topbar.demoMode')})
                    </div>
                    {businesses.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        {t('topbar.newBusiness')}
                      </div>
                    ) : (
                      businesses.map((biz) => (
                        <button
                          key={biz.id}
                          type="button"
                          onClick={() => {
                            switchBusiness(biz.id);
                            setShowBusinessMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-start text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${
                            activeBusiness?.id === biz.id
                              ? 'text-blue-600 dark:text-blue-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="truncate">{biz.name}</span>
                          <span className="text-[11px] text-slate-400 ms-2 shrink-0">
                            {getRoleLabel(biz.role)}
                          </span>
                        </button>
                      ))
                    )}
                    <div className="border-t border-slate-100 dark:border-slate-800 mt-1.5 pt-1.5 px-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowBusinessMenu(false);
                          setShowCreateBizModal(true);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('topbar.newBusiness')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Center: Global Search */}
            <div className="relative flex-1 max-w-md hidden md:block" ref={searchRef}>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  placeholder={t('topbar.searchPlaceholder')}
                  className="w-full ps-9 pe-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {searchFocused && searchQuery.trim().length > 0 && (
                <div className="absolute start-0 end-0 mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2 z-50 max-h-80 overflow-y-auto">
                  {!hasSearchHits ? (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      {t('topbar.noSearchResults')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.products.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                            {t('topbar.groupProducts')}
                          </div>
                          {searchResults.products.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setActiveSection('products');
                                setSearchFocused(false);
                              }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer"
                            >
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {p.name}
                              </span>
                              <span className="font-mono text-slate-500 ms-2 shrink-0 tabular-nums">
                                {formatMoney(p.sellingPrice, activeBusiness?.currency)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.customers.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                            {t('topbar.groupCustomers')}
                          </div>
                          {searchResults.customers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setActiveSection('customers');
                                setSearchFocused(false);
                              }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer"
                            >
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {c.name}
                              </span>
                              <span className="text-slate-500">{c.phone || c.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.sales.length > 0 && (
                        <div>
                          <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">
                            {t('topbar.groupInvoices')}
                          </div>
                          {searchResults.sales.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setViewingReceipt(s);
                                setSearchFocused(false);
                              }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer"
                            >
                              <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                                {s.receiptNumber}
                              </span>
                              <span className="font-mono text-slate-500 tabular-nums">
                                {formatMoney(s.grandTotal, activeBusiness?.currency)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Date/Time, Scanner, Language & Region, Theme, Notifications, Profile */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className="hidden xl:block text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                {formattedClock}
              </div>

              {activeBusiness && can('use_pos') && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.medium();
                    toggleScannerMode();
                  }}
                  aria-pressed={scannerModeActive}
                  title={
                    scannerModeActive
                      ? t('topbar.scannerActiveHint')
                      : t('topbar.scannerTooltip')
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    scannerModeActive
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Barcode className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {scannerModeActive ? t('topbar.scannerOn') : t('topbar.scannerMode')}
                  </span>
                  {cart.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-mono font-semibold tabular-nums leading-none">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  )}
                </button>
              )}

              {/* Language & Region Quick Switcher */}
              <div className="relative" ref={langRef}>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setShowLangMenu((s) => !s);
                  }}
                  aria-expanded={showLangMenu}
                  aria-label={t('topbar.languageRegion')}
                  title={t('topbar.languageRegion')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="font-mono font-semibold">{languageMeta.shortCode}</span>
                </button>

                {showLangMenu && (
                  <div className="absolute end-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3 space-y-3 z-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {t('i18n.quickSwitcherTitle')}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {regionLocale === 'auto' ? t('i18n.timeAuto') : regionLocale}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {t('i18n.language')}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => {
                              haptics.selection();
                              setLanguage(lang.code);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-start flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                              language === lang.code
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span className="truncate">{lang.nativeName}</span>
                            <span className="text-[10px] font-mono opacity-80 shrink-0">
                              {lang.shortCode}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <label
                        htmlFor="quick-region-select"
                        className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
                      >
                        {t('i18n.regionFormat')}
                      </label>
                      <select
                        id="quick-region-select"
                        value={regionLocale}
                        onChange={(e) => {
                          haptics.selection();
                          setRegionLocale(e.target.value as RegionLocaleId);
                        }}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="auto">{t('i18n.autoRegion')}</option>
                        {REGION_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                              timeCycle === opt.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  toggleTheme();
                }}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
                title={theme === 'dark' ? t('topbar.lightMode') : t('topbar.darkMode')}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setShowNotifMenu((s) => !s)}
                  className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  aria-label={t('topbar.notifications')}
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 end-1.5 w-1.5 h-1.5 rounded-full bg-blue-600" />
                  )}
                </button>

                {showNotifMenu && (
                  <div className="absolute end-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-50">
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {t('topbar.notifications')}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {notifications.length} {t('common.items')}
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-xs text-slate-500 text-center">
                          {t('topbar.noAlerts')}
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              setActiveSection(n.targetSection);
                              setShowNotifMenu(false);
                            }}
                            className="w-full text-start px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                          >
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {n.title}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {n.detail}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Profile & Role Switcher */}
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setShowProfileMenu((s) => !s)}
                  className="flex items-center gap-2 ps-1.5 pe-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <img
                    src={currentUserAvatar}
                    alt={currentUserName}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-lg object-cover bg-slate-200 dark:bg-slate-800"
                  />
                  <div className="hidden sm:block text-start">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight max-w-[110px] truncate">
                      {currentUserName}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      {getRoleLabel(currentRole)}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showProfileMenu && (
                  <div className="absolute end-0 mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-50">
                    <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {currentUserName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {currentUserEmail}
                      </div>
                    </div>

                    {mode === 'demo' && (
                      <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                          {t('topbar.demoRoleLabel')}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(['owner', 'admin', 'manager', 'cashier'] as UserRole[]).map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => setDemoRole(role)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-start transition-colors cursor-pointer ${
                                currentRole === role
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {getRoleLabel(role)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-2 space-y-1">
                      {mode === 'demo' ? (
                        <>
                          {firebaseAvailable && (
                            <button
                              type="button"
                              onClick={handleGoogleSignIn}
                              disabled={authLoading}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              {authLoading ? t('common.loading') : t('topbar.syncGoogle')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              resetDemoData();
                              setShowProfileMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {t('topbar.resetDemo')}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            await signOutToDemo();
                            setShowProfileMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t('topbar.signOut')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Honest Mode Banner / Error Banner */}
          {mode === 'demo' && (
            <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <ClipboardList className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{t('topbar.demoBanner')}</span>
              </div>
              {firebaseAvailable && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer whitespace-nowrap"
                >
                  {authLoading ? t('common.loading') : t('topbar.syncGoogle')}
                </button>
              )}
            </div>
          )}

        {errorBanner && (
          <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300">
            <span className="truncate">{errorBanner}</span>
            <button
              type="button"
              onClick={clearError}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {mode === 'firebase' && !activeBusiness ? (
            <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Create Your Cloud Workspace
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You are signed in to Cloud Firestore. Create a business profile to start recording live sales, inventory, and receipts.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateBizModal(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                Create Business Workspace
              </button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <CreateBusinessModal
        open={showCreateBizModal}
        onClose={() => setShowCreateBizModal(false)}
      />

      {/* Global Barcode Scanner Toast */}
      {scannerToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 end-5 z-50 max-w-sm rounded-xl border shadow-xl px-4 py-3 flex items-start gap-3 ${
            scannerToast.ok
              ? 'border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
              : 'border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
          }`}
        >
          {scannerToast.ok ? (
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4.5 h-4.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">{scannerToast.text}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {t('common.barcode')}: {scannerToast.code} · {cart.reduce((sum, item) => sum + item.quantity, 0)} {t('common.items')}
            </div>
            {activeSection !== 'pos' && scannerToast.ok && (
              <button
                type="button"
                onClick={() => {
                  setActiveSection('pos');
                  setScannerToast(null);
                }}
                className="mt-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {t('dashboard.openPos')}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setScannerToast(null)}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
