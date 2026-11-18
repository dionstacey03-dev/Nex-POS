export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function v2Api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ApiError(payload.error || 'The request could not be completed.', response.status);
  return payload;
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

export function submitCheckout(businessId: string, payload: CheckoutRequest) {
  return v2Api<{ sale: Record<string, unknown>; alreadyProcessed?: boolean }>(
    `/api/businesses/${encodeURIComponent(businessId)}/checkout`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
