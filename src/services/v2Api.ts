import type { Business, Product, UserRole } from '../types/nexpos';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readPayload<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const body = payload && typeof payload === 'object'
      ? payload as { error?: unknown; issues?: unknown }
      : undefined;
    const message = typeof body?.error === 'string'
      ? body.error
      : typeof payload === 'string' && payload
        ? payload
        : 'The request could not be completed.';
    throw new ApiError(message, response.status, body?.issues);
  }
  return payload as T;
}

export async function v2Api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  return readPayload<T>(response);
}

export interface V2BusinessSummary {
  id: string;
  name: string;
  businessType: Business['businessType'];
  currency: Business['currency'];
  taxRate: number;
  role: UserRole;
}

export interface V2WorkspaceSnapshot {
  business: Business;
  categories: unknown[];
  locations: unknown[];
  products: unknown[];
  customers: unknown[];
  suppliers: unknown[];
  employees: unknown[];
  sales: unknown[];
  stockMovements: unknown[];
  purchases: unknown[];
  limits?: Record<string, number>;
}

export interface CreateBusinessRequest {
  name: string;
  businessType: Business['businessType'];
  currency: Business['currency'];
  taxRate: number;
  timezone?: string;
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  categoryId: string;
  locationId?: string;
  sku: string;
  barcode?: string;
  purchasePrice: number;
  sellingPrice: number;
  minStockLevel?: number;
  imageUrl?: string;
}

export type UpdateProductRequest = Partial<Omit<CreateProductRequest, 'categoryId'>> & {
  categoryId?: string | null;
  locationId?: string | null;
  description?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  active?: boolean;
};

export interface CheckoutRequest {
  requestId: string;
  items: Array<
    | { kind: 'product'; productId: string; quantity: number }
    | { kind: 'custom'; name: string; sku?: string; unitPrice: number; quantity: number }
  >;
  customerId?: string;
  locationId?: string;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
  paymentMethod: 'cash' | 'card' | 'other';
  amountTendered?: number;
  paymentReference?: string;
}

export function getBusinesses() {
  return v2Api<{ businesses: V2BusinessSummary[] }>('/api/businesses');
}

export function createBusiness(payload: CreateBusinessRequest) {
  return v2Api<{ business: V2BusinessSummary }>('/api/businesses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getWorkspace(businessId: string) {
  return v2Api<V2WorkspaceSnapshot>(
    `/api/businesses/${encodeURIComponent(businessId)}/workspace`,
  );
}

export function getProducts(businessId: string) {
  return v2Api<{ products: Product[] }>(
    `/api/businesses/${encodeURIComponent(businessId)}/products`,
  );
}

export function createProduct(businessId: string, payload: CreateProductRequest) {
  return v2Api<{ product: Product }>(
    `/api/businesses/${encodeURIComponent(businessId)}/products`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateProduct(businessId: string, productId: string, payload: UpdateProductRequest) {
  return v2Api<{ product: Product }>(
    `/api/businesses/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function archiveProduct(businessId: string, productId: string) {
  return v2Api<{ deleted: boolean; archived?: boolean; alreadyInactive?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
  );
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest> & {
  description?: string | null;
  color?: string | null;
  active?: boolean;
};

export interface V2Category {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  color: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function getCategories(businessId: string) {
  return v2Api<{ categories: V2Category[] }>(
    `/api/businesses/${encodeURIComponent(businessId)}/categories`,
  );
}

export function createCategory(businessId: string, payload: CreateCategoryRequest) {
  return v2Api<{ category: V2Category }>(
    `/api/businesses/${encodeURIComponent(businessId)}/categories`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateCategory(businessId: string, categoryId: string, payload: UpdateCategoryRequest) {
  return v2Api<{ category: V2Category; archived?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function archiveCategory(businessId: string, categoryId: string) {
  return v2Api<{ category: V2Category; archived: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'DELETE' },
  );
}

export interface V2Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export type UpdateCustomerRequest = Partial<CreateCustomerRequest> & {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export function getCustomers(businessId: string) {
  return v2Api<{ customers: V2Customer[] }>(
    `/api/businesses/${encodeURIComponent(businessId)}/customers`,
  );
}

export function createCustomer(businessId: string, payload: CreateCustomerRequest) {
  return v2Api<{ customer: V2Customer }>(
    `/api/businesses/${encodeURIComponent(businessId)}/customers`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateCustomer(businessId: string, customerId: string, payload: UpdateCustomerRequest) {
  return v2Api<{ customer: V2Customer }>(
    `/api/businesses/${encodeURIComponent(businessId)}/customers/${encodeURIComponent(customerId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export interface V2Supplier {
  id: string;
  businessId: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierRequest {
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export type UpdateSupplierRequest = Partial<CreateSupplierRequest> & {
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export function getSuppliers(businessId: string) {
  return v2Api<{ suppliers: V2Supplier[] }>(
    `/api/businesses/${encodeURIComponent(businessId)}/suppliers`,
  );
}

export function createSupplier(businessId: string, payload: CreateSupplierRequest) {
  return v2Api<{ supplier: V2Supplier }>(
    `/api/businesses/${encodeURIComponent(businessId)}/suppliers`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateSupplier(businessId: string, supplierId: string, payload: UpdateSupplierRequest) {
  return v2Api<{ supplier: V2Supplier }>(
    `/api/businesses/${encodeURIComponent(businessId)}/suppliers/${encodeURIComponent(supplierId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function submitCheckout(businessId: string, payload: CheckoutRequest) {
  return v2Api<{ sale: Record<string, unknown>; alreadyProcessed?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/checkout`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function adjustStock(
  businessId: string,
  productId: string,
  payload: { requestId: string; type: 'in' | 'out' | 'adjustment'; quantityChange: number; reason: string; locationId?: string },
) {
  return v2Api<{ stockQuantity: number; alreadyApplied?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}/stock-adjustments`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function refundSale(
  businessId: string,
  saleId: string,
  payload: { requestId: string; reason: string; refundMethod: 'cash' | 'other'; paymentReference?: string },
) {
  return v2Api<{ refund?: Record<string, unknown>; alreadyRefunded?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/sales/${encodeURIComponent(saleId)}/refund`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function createPurchaseOrder(
  businessId: string,
  payload: { supplierId: string; locationId?: string; items: Array<{ productId: string; quantity: number; unitCost: number }> },
) {
  return v2Api<{ purchaseOrder: Record<string, unknown> }>(
    `/api/businesses/${encodeURIComponent(businessId)}/purchase-orders`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function receivePurchaseOrder(
  businessId: string,
  purchaseOrderId: string,
  payload: { requestId: string; items: Array<{ purchaseOrderItemId: string; quantity: number }> },
) {
  return v2Api<{ receipt: Record<string, unknown>; alreadyReceived?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/purchase-orders/${encodeURIComponent(purchaseOrderId)}/receive`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
