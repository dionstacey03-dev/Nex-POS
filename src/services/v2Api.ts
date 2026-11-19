import type { Business, UserRole } from '../types/nexpos';

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
