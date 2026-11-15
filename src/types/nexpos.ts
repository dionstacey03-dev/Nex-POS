export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier';

export type BusinessType =
  | 'retail'
  | 'cafe'
  | 'pharmacy'
  | 'apparel'
  | 'electronics'
  | 'general';

export type CurrencyCode =
  | 'LKR'
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'AUD'
  | 'SGD'
  | 'INR'
  | 'JPY'
  | 'AED';

export type NavSection =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'purchases'
  | 'sales'
  | 'employees'
  | 'reports'
  | 'settings';

export type PaymentMethod = 'cash' | 'card' | 'other';

export interface Business {
  id: string;
  name: string;
  businessType: BusinessType;
  ownerUid: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: CurrencyCode;
  taxRate: number;
  receiptHeader?: string;
  receiptFooter?: string;
  lowStockAlertEnabled?: boolean;
  lowStockAlertEmail?: string;
  lowStockAlertTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  uid: string;
  businessId: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  color?: string;
  active: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLocation {
  id: string;
  businessId: string;
  name: string;
  address?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  categoryId: string;
  sku: string;
  barcode?: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  locationId?: string;
  imageUrl?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  totalSpent: number;
  ordersCount: number;
  lastPurchaseAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  businessId: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
  isCustom?: boolean;
}

export interface Sale {
  id: string;
  businessId: string;
  receiptNumber: string;
  customerId?: string;
  customerName?: string;
  cashierUid: string;
  cashierName: string;
  locationId?: string;
  items: SaleItem[];
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
  status: 'completed' | 'refunded';
  createdAt: string;
}

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'sale' | 'purchase';

export interface StockMovement {
  id: string;
  businessId: string;
  productId: string;
  productName: string;
  locationId?: string;
  type: StockMovementType;
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceId?: string;
  actorUid: string;
  actorName: string;
  createdAt: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  businessId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  locationId?: string;
  items: PurchaseItem[];
  totalCost: number;
  status: 'ordered' | 'received' | 'cancelled';
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  isCustom?: boolean;
}

export interface DiscountConfig {
  type: 'fixed' | 'percent';
  value: number;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'alert';
  timestamp: string;
  targetSection: NavSection;
}

export type Permission =
  | 'view_dashboard'
  | 'use_pos'
  | 'manage_products'
  | 'delete_products'
  | 'manage_categories'
  | 'adjust_inventory'
  | 'manage_customers'
  | 'manage_suppliers'
  | 'manage_purchases'
  | 'refund_sales'
  | 'manage_employees'
  | 'view_reports'
  | 'manage_settings';

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  manager: 'Manager',
  cashier: 'Cashier',
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'view_dashboard',
    'use_pos',
    'manage_products',
    'delete_products',
    'manage_categories',
    'adjust_inventory',
    'manage_customers',
    'manage_suppliers',
    'manage_purchases',
    'refund_sales',
    'manage_employees',
    'view_reports',
    'manage_settings',
  ],
  admin: [
    'view_dashboard',
    'use_pos',
    'manage_products',
    'delete_products',
    'manage_categories',
    'adjust_inventory',
    'manage_customers',
    'manage_suppliers',
    'manage_purchases',
    'refund_sales',
    'manage_employees',
    'view_reports',
    'manage_settings',
  ],
  manager: [
    'view_dashboard',
    'use_pos',
    'manage_products',
    'manage_categories',
    'adjust_inventory',
    'manage_customers',
    'manage_suppliers',
    'manage_purchases',
    'refund_sales',
    'view_reports',
  ],
  cashier: ['view_dashboard', 'use_pos', 'manage_customers'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const FIELD_LIMITS = {
  NAME_MAX: 120,
  PRODUCT_NAME_MAX: 140,
  DESCRIPTION_MAX: 500,
  SKU_MAX: 64,
  BARCODE_MAX: 64,
  ADDRESS_MAX: 300,
  PHONE_MAX: 40,
  EMAIL_MAX: 160,
  REASON_MAX: 240,
  RECEIPT_TEXT_MAX: 300,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
} as const;
