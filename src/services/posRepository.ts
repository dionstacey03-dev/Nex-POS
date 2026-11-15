import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { createDemoDatasets } from '../data/demoData';
import {
  Business,
  BusinessType,
  Category,
  CurrencyCode,
  Customer,
  Employee,
  FIELD_LIMITS,
  InventoryLocation,
  Product,
  PurchaseOrder,
  Sale,
  StockMovement,
  Supplier,
  UserRole,
} from '../types/nexpos';
import { roundMoney } from '../utils/currency';

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${rand}`;
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function cleanStr(val: string | undefined, maxLen: number): string | undefined {
  if (val === undefined) return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export interface MembershipSummary {
  businessId: string;
  businessName: string;
  role: UserRole;
  joinedAt: string;
}

export async function upsertUserProfile(user: User, activeBusinessId?: string, theme: 'light' | 'dark' = 'light') {
  if (!db) return;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const base = omitUndefined({
        uid: user.uid,
        email: (user.email ?? 'user@nexpos.local').slice(0, FIELD_LIMITS.EMAIL_MAX),
        displayName: (user.displayName ?? user.email?.split('@')[0] ?? 'NexPOS User').slice(0, FIELD_LIMITS.NAME_MAX),
        photoUrl: cleanStr(user.photoURL ?? undefined, 500),
        activeBusinessId: cleanStr(activeBusinessId, 128),
        theme,
      });

      if (!snap.exists()) {
        tx.set(ref, {
          ...base,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(
          ref,
          omitUndefined({
            displayName: base.displayName,
            photoUrl: base.photoUrl,
            activeBusinessId: activeBusinessId ? cleanStr(activeBusinessId, 128) : snap.data().activeBusinessId,
            theme: snap.data().theme ?? theme,
            updatedAt: serverTimestamp(),
          })
        );
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function fetchUserMemberships(uid: string): Promise<MembershipSummary[]> {
  if (!db) return [];
  const path = `users/${uid}/memberships`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'memberships'));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        businessId: String(data.businessId),
        businessName: String(data.businessName),
        role: (data.role as UserRole) ?? 'cashier',
        joinedAt: toIsoString(data.joinedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createBusinessInFirestore(
  user: User,
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
): Promise<string> {
  if (!db) throw new Error('Firestore is not initialized.');
  const businessId = generateId('biz');
  const locationId = generateId('loc');
  const batch = writeBatch(db);

  const bizPayload = omitUndefined({
    id: businessId,
    name: input.name.trim().slice(0, FIELD_LIMITS.NAME_MAX),
    businessType: input.businessType,
    ownerUid: user.uid,
    address: cleanStr(input.address, FIELD_LIMITS.ADDRESS_MAX),
    phone: cleanStr(input.phone, FIELD_LIMITS.PHONE_MAX),
    email: cleanStr(input.email ?? user.email ?? undefined, FIELD_LIMITS.EMAIL_MAX),
    currency: input.currency,
    taxRate: Math.min(100, Math.max(0, Number(input.taxRate) || 0)),
    receiptHeader: `Welcome to ${input.name.trim().slice(0, 80)}`,
    receiptFooter: 'Thank you for your business. Powered by NexPOS.',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const empPayload = {
    uid: user.uid,
    businessId,
    name: (user.displayName ?? user.email?.split('@')[0] ?? 'Owner').slice(0, FIELD_LIMITS.NAME_MAX),
    email: (user.email ?? 'owner@nexpos.local').slice(0, FIELD_LIMITS.EMAIL_MAX),
    role: 'owner' as UserRole,
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const membershipPayload = {
    businessId,
    businessName: input.name.trim().slice(0, FIELD_LIMITS.NAME_MAX),
    role: 'owner' as UserRole,
    joinedAt: serverTimestamp(),
  };

  batch.set(doc(db, 'businesses', businessId), bizPayload);
  batch.set(doc(db, 'businesses', businessId, 'employees', user.uid), empPayload);
  batch.set(doc(db, 'users', user.uid, 'memberships', businessId), membershipPayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}`);
  }

  // Create default location (and optional sample catalog) after owner employee exists
  const setupBatch = writeBatch(db);
  setupBatch.set(
    doc(db, 'businesses', businessId, 'locations', locationId),
    omitUndefined({
      id: locationId,
      businessId,
      name: 'Main Storefront',
      address: cleanStr(input.address, 240),
      isDefault: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  if (seedSample) {
    const sample = createDemoDatasets(user.uid)[0];
    const catIdMap = new Map<string, string>();
    for (let catIdx = 0; catIdx < sample.categories.length; catIdx++) {
      const cat = sample.categories[catIdx];
      const newCatId = generateId('cat');
      catIdMap.set(cat.id, newCatId);
      setupBatch.set(
        doc(db, 'businesses', businessId, 'categories', newCatId),
        omitUndefined({
          id: newCatId,
          businessId,
          name: cat.name,
          description: cat.description,
          color: cat.color,
          active: true,
          sortOrder: cat.sortOrder ?? catIdx,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    for (const prod of sample.products) {
      const newProdId = generateId('prod');
      setupBatch.set(
        doc(db, 'businesses', businessId, 'products', newProdId),
        omitUndefined({
          id: newProdId,
          businessId,
          name: prod.name,
          description: prod.description,
          categoryId: catIdMap.get(prod.categoryId) ?? 'general',
          sku: prod.sku,
          barcode: prod.barcode,
          purchasePrice: prod.purchasePrice,
          sellingPrice: prod.sellingPrice,
          stockQuantity: prod.stockQuantity,
          minStockLevel: prod.minStockLevel,
          locationId,
          imageUrl: prod.imageUrl,
          active: prod.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    for (const cust of sample.customers.slice(0, 3)) {
      const newCustId = generateId('cust');
      setupBatch.set(
        doc(db, 'businesses', businessId, 'customers', newCustId),
        omitUndefined({
          id: newCustId,
          businessId,
          name: cust.name,
          phone: cust.phone,
          email: cust.email,
          address: cust.address,
          totalSpent: 0,
          ordersCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    for (const sup of sample.suppliers.slice(0, 2)) {
      const newSupId = generateId('sup');
      setupBatch.set(
        doc(db, 'businesses', businessId, 'suppliers', newSupId),
        omitUndefined({
          id: newSupId,
          businessId,
          companyName: sup.companyName,
          contactPerson: sup.contactPerson,
          phone: sup.phone,
          email: sup.email,
          address: sup.address,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  try {
    await setupBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}/setup`);
  }

  return businessId;
}

export interface BusinessSubscriptions {
  onBusiness: (biz: Business | null) => void;
  onCategories: (items: Category[]) => void;
  onLocations: (items: InventoryLocation[]) => void;
  onProducts: (items: Product[]) => void;
  onCustomers: (items: Customer[]) => void;
  onSuppliers: (items: Supplier[]) => void;
  onEmployees: (items: Employee[]) => void;
  onSales: (items: Sale[]) => void;
  onMovements: (items: StockMovement[]) => void;
  onPurchases: (items: PurchaseOrder[]) => void;
  onError: (err: Error) => void;
}

export function subscribeToBusinessWorkspace(
  businessId: string,
  role: UserRole,
  cb: BusinessSubscriptions
): Unsubscribe {
  if (!db) return () => {};
  const unsubs: Unsubscribe[] = [];

  const listen = <T extends object>(
    colName: string,
    mapper: (id: string, data: Record<string, unknown>) => T,
    setter: (items: T[]) => void,
    sortDescField?: keyof T
  ) => {
    const colRef = collection(db!, 'businesses', businessId, colName);
    const q = query(colRef, where('businessId', '==', businessId));
    const path = `businesses/${businessId}/${colName}`;
    unsubs.push(
      onSnapshot(
        q,
        (snap) => {
          const mapped = snap.docs.map((d) => mapper(d.id, d.data() as Record<string, unknown>));
          if (sortDescField) {
            mapped.sort((a, b) =>
              String(b[sortDescField] ?? '').localeCompare(String(a[sortDescField] ?? ''))
            );
          }
          setter(mapped);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, path);
          } catch (e) {
            cb.onError(e instanceof Error ? e : new Error(String(e)));
          }
        }
      )
    );
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'businesses', businessId),
      (snap) => {
        if (!snap.exists()) {
          cb.onBusiness(null);
          return;
        }
        const d = snap.data();
        cb.onBusiness({
          id: snap.id,
          name: String(d.name),
          businessType: d.businessType as BusinessType,
          ownerUid: String(d.ownerUid),
          logoUrl: d.logoUrl ? String(d.logoUrl) : undefined,
          address: d.address ? String(d.address) : undefined,
          phone: d.phone ? String(d.phone) : undefined,
          email: d.email ? String(d.email) : undefined,
          currency: (d.currency as CurrencyCode) ?? 'LKR',
          taxRate: Number(d.taxRate ?? 0),
          receiptHeader: d.receiptHeader ? String(d.receiptHeader) : undefined,
          receiptFooter: d.receiptFooter ? String(d.receiptFooter) : undefined,
          lowStockAlertEnabled: Boolean(d.lowStockAlertEnabled ?? false),
          lowStockAlertEmail: d.lowStockAlertEmail ? String(d.lowStockAlertEmail) : undefined,
          lowStockAlertTime: d.lowStockAlertTime ? String(d.lowStockAlertTime) : undefined,
          createdAt: toIsoString(d.createdAt),
          updatedAt: toIsoString(d.updatedAt),
        });
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `businesses/${businessId}`);
        } catch (e) {
          cb.onError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    )
  );

  listen(
    'categories',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      name: String(d.name),
      description: d.description ? String(d.description) : undefined,
      color: d.color ? String(d.color) : '#2563EB',
      active: Boolean(d.active),
      sortOrder:
        typeof d.sortOrder === 'number' && Number.isFinite(d.sortOrder)
          ? d.sortOrder
          : undefined,
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    }),
    (items) => {
      items.sort((a, b) => {
        const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
      });
      cb.onCategories(items);
    }
  );

  listen(
    'locations',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      name: String(d.name),
      address: d.address ? String(d.address) : undefined,
      isDefault: Boolean(d.isDefault),
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    }),
    cb.onLocations
  );

  listen(
    'products',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      name: String(d.name),
      description: d.description ? String(d.description) : undefined,
      categoryId: String(d.categoryId),
      sku: String(d.sku),
      barcode: d.barcode ? String(d.barcode) : undefined,
      purchasePrice: Number(d.purchasePrice ?? 0),
      sellingPrice: Number(d.sellingPrice ?? 0),
      stockQuantity: Number(d.stockQuantity ?? 0),
      minStockLevel: Number(d.minStockLevel ?? 0),
      locationId: d.locationId ? String(d.locationId) : undefined,
      imageUrl: d.imageUrl ? String(d.imageUrl) : undefined,
      active: Boolean(d.active),
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    }),
    cb.onProducts
  );

  listen(
    'customers',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      name: String(d.name),
      phone: d.phone ? String(d.phone) : undefined,
      email: d.email ? String(d.email) : undefined,
      address: d.address ? String(d.address) : undefined,
      totalSpent: Number(d.totalSpent ?? 0),
      ordersCount: Number(d.ordersCount ?? 0),
      lastPurchaseAt: d.lastPurchaseAt ? toIsoString(d.lastPurchaseAt) : undefined,
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    }),
    cb.onCustomers
  );

  listen(
    'sales',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      receiptNumber: String(d.receiptNumber),
      customerId: d.customerId ? String(d.customerId) : undefined,
      customerName: d.customerName ? String(d.customerName) : undefined,
      cashierUid: String(d.cashierUid),
      cashierName: String(d.cashierName),
      locationId: d.locationId ? String(d.locationId) : undefined,
      items: Array.isArray(d.items) ? (d.items as Sale['items']) : [],
      subtotal: Number(d.subtotal ?? 0),
      discountType: d.discountType as Sale['discountType'],
      discountValue: d.discountValue !== undefined ? Number(d.discountValue) : undefined,
      discountAmount: Number(d.discountAmount ?? 0),
      taxRate: Number(d.taxRate ?? 0),
      taxAmount: Number(d.taxAmount ?? 0),
      grandTotal: Number(d.grandTotal ?? 0),
      paymentMethod: d.paymentMethod as Sale['paymentMethod'],
      amountTendered: Number(d.amountTendered ?? 0),
      changeDue: Number(d.changeDue ?? 0),
      paymentReference: d.paymentReference ? String(d.paymentReference) : undefined,
      status: (d.status as Sale['status']) ?? 'completed',
      createdAt: toIsoString(d.createdAt),
    }),
    cb.onSales,
    'createdAt'
  );

  listen(
    'stockMovements',
    (id, d) => ({
      id,
      businessId: String(d.businessId),
      productId: String(d.productId),
      productName: String(d.productName),
      locationId: d.locationId ? String(d.locationId) : undefined,
      type: d.type as StockMovement['type'],
      quantityDelta: Number(d.quantityDelta ?? 0),
      previousStock: Number(d.previousStock ?? 0),
      newStock: Number(d.newStock ?? 0),
      reason: String(d.reason),
      referenceId: d.referenceId ? String(d.referenceId) : undefined,
      actorUid: String(d.actorUid),
      actorName: String(d.actorName),
      createdAt: toIsoString(d.createdAt),
    }),
    cb.onMovements,
    'createdAt'
  );

  // Manager+ restricted collections
  if (role === 'owner' || role === 'admin' || role === 'manager') {
    listen(
      'suppliers',
      (id, d) => ({
        id,
        businessId: String(d.businessId),
        companyName: String(d.companyName),
        contactPerson: d.contactPerson ? String(d.contactPerson) : undefined,
        phone: d.phone ? String(d.phone) : undefined,
        email: d.email ? String(d.email) : undefined,
        address: d.address ? String(d.address) : undefined,
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      }),
      cb.onSuppliers
    );

    listen(
      'employees',
      (id, d) => ({
        uid: id,
        businessId: String(d.businessId),
        name: String(d.name),
        email: String(d.email),
        role: d.role as UserRole,
        status: (d.status as Employee['status']) ?? 'active',
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      }),
      cb.onEmployees
    );

    listen(
      'purchases',
      (id, d) => ({
        id,
        businessId: String(d.businessId),
        purchaseNumber: String(d.purchaseNumber),
        supplierId: String(d.supplierId),
        supplierName: String(d.supplierName),
        locationId: d.locationId ? String(d.locationId) : undefined,
        items: Array.isArray(d.items) ? (d.items as PurchaseOrder['items']) : [],
        totalCost: Number(d.totalCost ?? 0),
        status: d.status as PurchaseOrder['status'],
        createdByUid: String(d.createdByUid),
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      }),
      cb.onPurchases,
      'createdAt'
    );
  } else {
    cb.onSuppliers([]);
    cb.onEmployees([]);
    cb.onPurchases([]);
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function saveProductInFirestore(
  businessId: string,
  product: Omit<Product, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/products/${product.id}`;
  const ref = doc(db, 'businesses', businessId, 'products', product.id);
  const payload = omitUndefined({
    id: product.id,
    businessId,
    name: product.name.trim().slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX),
    description: cleanStr(product.description, FIELD_LIMITS.DESCRIPTION_MAX),
    categoryId: product.categoryId,
    sku: product.sku.trim().slice(0, FIELD_LIMITS.SKU_MAX),
    barcode: cleanStr(product.barcode, FIELD_LIMITS.BARCODE_MAX),
    purchasePrice: Math.max(0, roundMoney(product.purchasePrice)),
    sellingPrice: Math.max(0, roundMoney(product.sellingPrice)),
    stockQuantity: Math.max(0, Math.floor(product.stockQuantity)),
    minStockLevel: Math.max(0, Math.floor(product.minStockLevel)),
    locationId: cleanStr(product.locationId, 128),
    imageUrl: cleanStr(product.imageUrl, 1000),
    active: product.active,
  });

  try {
    if (isNew) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const { id: _id, businessId: _bid, ...updatable } = payload;
      await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteProductInFirestore(businessId: string, productId: string) {
  if (!db) return;
  const path = `businesses/${businessId}/products/${productId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCategoryInFirestore(
  businessId: string,
  category: Omit<Category, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/categories/${category.id}`;
  const ref = doc(db, 'businesses', businessId, 'categories', category.id);
  const payload = omitUndefined({
    id: category.id,
    businessId,
    name: category.name.trim().slice(0, 80),
    description: cleanStr(category.description, 240),
    color: cleanStr(category.color, 30),
    active: category.active,
    sortOrder:
      category.sortOrder !== undefined
        ? Math.min(10000, Math.max(0, Math.floor(category.sortOrder)))
        : undefined,
  });

  try {
    if (isNew) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const { id: _id, businessId: _bid, ...updatable } = payload;
      await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function reorderCategoriesInFirestore(
  businessId: string,
  orderedCategoryIds: string[]
) {
  if (!db || orderedCategoryIds.length === 0) return;
  const path = `businesses/${businessId}/categories`;
  try {
    const chunkSize = 400;
    for (let offset = 0; offset < orderedCategoryIds.length; offset += chunkSize) {
      const batch = writeBatch(db);
      const slice = orderedCategoryIds.slice(offset, offset + chunkSize);
      slice.forEach((categoryId, idx) => {
        const orderIndex = Math.min(10000, offset + idx);
        batch.update(doc(db!, 'businesses', businessId, 'categories', categoryId), {
          sortOrder: orderIndex,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCategoryInFirestore(businessId: string, categoryId: string) {
  if (!db) return;
  const path = `businesses/${businessId}/categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCustomerInFirestore(
  businessId: string,
  customer: Omit<Customer, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/customers/${customer.id}`;
  const ref = doc(db, 'businesses', businessId, 'customers', customer.id);
  const payload = omitUndefined({
    id: customer.id,
    businessId,
    name: customer.name.trim().slice(0, FIELD_LIMITS.NAME_MAX),
    phone: cleanStr(customer.phone, FIELD_LIMITS.PHONE_MAX),
    email: cleanStr(customer.email, FIELD_LIMITS.EMAIL_MAX),
    address: cleanStr(customer.address, FIELD_LIMITS.ADDRESS_MAX),
    totalSpent: Math.max(0, roundMoney(customer.totalSpent)),
    ordersCount: Math.max(0, Math.floor(customer.ordersCount)),
  });

  try {
    if (isNew) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const { id: _id, businessId: _bid, ...updatable } = payload;
      await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function saveSupplierInFirestore(
  businessId: string,
  supplier: Omit<Supplier, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/suppliers/${supplier.id}`;
  const ref = doc(db, 'businesses', businessId, 'suppliers', supplier.id);
  const payload = omitUndefined({
    id: supplier.id,
    businessId,
    companyName: supplier.companyName.trim().slice(0, 140),
    contactPerson: cleanStr(supplier.contactPerson, FIELD_LIMITS.NAME_MAX),
    phone: cleanStr(supplier.phone, FIELD_LIMITS.PHONE_MAX),
    email: cleanStr(supplier.email, FIELD_LIMITS.EMAIL_MAX),
    address: cleanStr(supplier.address, FIELD_LIMITS.ADDRESS_MAX),
  });

  try {
    if (isNew) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const { id: _id, businessId: _bid, ...updatable } = payload;
      await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteSupplierInFirestore(businessId: string, supplierId: string) {
  if (!db) return;
  const path = `businesses/${businessId}/suppliers/${supplierId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveLocationInFirestore(
  businessId: string,
  location: Omit<InventoryLocation, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/locations/${location.id}`;
  const ref = doc(db, 'businesses', businessId, 'locations', location.id);
  const payload = omitUndefined({
    id: location.id,
    businessId,
    name: location.name.trim().slice(0, 100),
    address: cleanStr(location.address, 240),
    isDefault: location.isDefault,
  });

  try {
    if (isNew) {
      await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const { id: _id, businessId: _bid, ...updatable } = payload;
      await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function executeSaleTransactionInFirestore(
  businessId: string,
  sale: Omit<Sale, 'createdAt'>
): Promise<void> {
  if (!db) return;
  const salePath = `businesses/${businessId}/sales/${sale.id}`;
  try {
    await runTransaction(db, async (tx) => {
      const inventoriedItems = sale.items.filter((item) => !item.isCustom);

      const productSnapshots = await Promise.all(
        inventoriedItems.map((item) =>
          tx.get(doc(db!, 'businesses', businessId, 'products', item.productId))
        )
      );

      let customerSnap = null;
      if (sale.customerId) {
        customerSnap = await tx.get(
          doc(db!, 'businesses', businessId, 'customers', sale.customerId)
        );
      }

      // Verify stock availability for inventoried items first
      const stockUpdates: Array<{
        ref: ReturnType<typeof doc>;
        productId: string;
        productName: string;
        previousStock: number;
        newStock: number;
        delta: number;
        locationId?: string;
      }> = [];

      for (let i = 0; i < inventoriedItems.length; i++) {
        const item = inventoriedItems[i];
        const snap = productSnapshots[i];
        if (!snap.exists()) {
          throw new Error(`Product "${item.name}" no longer exists.`);
        }
        const currentStock = Number(snap.data().stockQuantity ?? 0);
        if (currentStock < item.quantity) {
          throw new Error(
            `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${item.quantity}.`
          );
        }
        stockUpdates.push({
          ref: snap.ref,
          productId: item.productId,
          productName: item.name,
          previousStock: currentStock,
          newStock: currentStock - item.quantity,
          delta: -item.quantity,
          locationId: snap.data().locationId ? String(snap.data().locationId) : sale.locationId,
        });
      }

      // 1. Write Sale record
      tx.set(
        doc(db!, 'businesses', businessId, 'sales', sale.id),
        omitUndefined({
          id: sale.id,
          businessId,
          receiptNumber: sale.receiptNumber,
          customerId: cleanStr(sale.customerId, 128),
          customerName: cleanStr(sale.customerName, 120),
          cashierUid: sale.cashierUid,
          cashierName: sale.cashierName.slice(0, 120),
          locationId: cleanStr(sale.locationId, 128),
          items: sale.items.map((item) =>
            omitUndefined({
              productId: item.productId,
              name: item.name.slice(0, FIELD_LIMITS.PRODUCT_NAME_MAX),
              sku: item.sku.slice(0, FIELD_LIMITS.SKU_MAX),
              quantity: Math.max(1, Math.floor(item.quantity)),
              unitPrice: roundMoney(item.unitPrice),
              costPrice: Math.max(0, roundMoney(item.costPrice)),
              lineTotal: roundMoney(item.lineTotal),
              isCustom: item.isCustom ? true : undefined,
            })
          ),
          subtotal: roundMoney(sale.subtotal),
          discountType: sale.discountType,
          discountValue: sale.discountValue,
          discountAmount: roundMoney(sale.discountAmount),
          taxRate: sale.taxRate,
          taxAmount: roundMoney(sale.taxAmount),
          grandTotal: roundMoney(sale.grandTotal),
          paymentMethod: sale.paymentMethod,
          amountTendered: roundMoney(sale.amountTendered),
          changeDue: roundMoney(sale.changeDue),
          paymentReference: cleanStr(sale.paymentReference, 100),
          status: 'completed',
          createdAt: serverTimestamp(),
        })
      );

      // 2. Decrement Product stock + write auditable StockMovement
      for (const upd of stockUpdates) {
        tx.update(upd.ref, {
          stockQuantity: upd.newStock,
          updatedAt: serverTimestamp(),
        });

        const movId = generateId('mov');
        tx.set(
          doc(db!, 'businesses', businessId, 'stockMovements', movId),
          omitUndefined({
            id: movId,
            businessId,
            productId: upd.productId,
            productName: upd.productName.slice(0, 140),
            locationId: cleanStr(upd.locationId, 128),
            type: 'sale',
            quantityDelta: upd.delta,
            previousStock: upd.previousStock,
            newStock: upd.newStock,
            reason: `POS Sale ${sale.receiptNumber}`.slice(0, 240),
            referenceId: sale.id,
            actorUid: sale.cashierUid,
            actorName: sale.cashierName.slice(0, 120),
            createdAt: serverTimestamp(),
          })
        );
      }

      // 3. Update Customer totals if selected
      if (customerSnap && customerSnap.exists()) {
        const prevSpent = Number(customerSnap.data().totalSpent ?? 0);
        const prevOrders = Number(customerSnap.data().ordersCount ?? 0);
        tx.update(customerSnap.ref, {
          totalSpent: roundMoney(prevSpent + sale.grandTotal),
          ordersCount: prevOrders + 1,
          lastPurchaseAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Insufficient stock') || error.message.includes('no longer exists'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, salePath);
  }
}

export async function adjustStockInFirestore(
  businessId: string,
  params: {
    productId: string;
    type: 'in' | 'out' | 'adjustment';
    quantityChange: number;
    reason: string;
    actorUid: string;
    actorName: string;
    locationId?: string;
  }
) {
  if (!db) return;
  const path = `businesses/${businessId}/products/${params.productId}`;
  try {
    await runTransaction(db, async (tx) => {
      const prodRef = doc(db!, 'businesses', businessId, 'products', params.productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product not found.');

      const previousStock = Number(snap.data().stockQuantity ?? 0);
      let newStock = previousStock;
      let delta = 0;

      if (params.type === 'in') {
        delta = Math.abs(Math.floor(params.quantityChange));
        newStock = previousStock + delta;
      } else if (params.type === 'out') {
        delta = -Math.abs(Math.floor(params.quantityChange));
        newStock = previousStock + delta;
      } else {
        newStock = Math.max(0, Math.floor(params.quantityChange));
        delta = newStock - previousStock;
      }

      if (newStock < 0) {
        throw new Error(`Adjustment would result in negative stock (${newStock}).`);
      }

      tx.update(prodRef, {
        stockQuantity: newStock,
        updatedAt: serverTimestamp(),
      });

      const movId = generateId('mov');
      tx.set(
        doc(db!, 'businesses', businessId, 'stockMovements', movId),
        omitUndefined({
          id: movId,
          businessId,
          productId: params.productId,
          productName: String(snap.data().name).slice(0, 140),
          locationId: cleanStr(params.locationId ?? snap.data().locationId, 128),
          type: params.type,
          quantityDelta: delta,
          previousStock,
          newStock,
          reason: params.reason.trim().slice(0, FIELD_LIMITS.REASON_MAX),
          actorUid: params.actorUid,
          actorName: params.actorName.slice(0, 120),
          createdAt: serverTimestamp(),
        })
      );
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('negative stock') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createPurchaseOrderInFirestore(
  businessId: string,
  po: Omit<PurchaseOrder, 'createdAt' | 'updatedAt'>
) {
  if (!db) return;
  const path = `businesses/${businessId}/purchases/${po.id}`;
  try {
    await setDoc(
      doc(db, 'businesses', businessId, 'purchases', po.id),
      omitUndefined({
        id: po.id,
        businessId,
        purchaseNumber: po.purchaseNumber,
        supplierId: po.supplierId,
        supplierName: po.supplierName.slice(0, 140),
        locationId: cleanStr(po.locationId, 128),
        items: po.items,
        totalCost: roundMoney(po.totalCost),
        status: po.status,
        createdByUid: po.createdByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function receivePurchaseOrderInFirestore(
  businessId: string,
  purchaseId: string,
  actorUid: string,
  actorName: string
) {
  if (!db) return;
  const path = `businesses/${businessId}/purchases/${purchaseId}`;
  try {
    await runTransaction(db, async (tx) => {
      const poRef = doc(db!, 'businesses', businessId, 'purchases', purchaseId);
      const poSnap = await tx.get(poRef);
      if (!poSnap.exists()) throw new Error('Purchase order not found.');
      if (poSnap.data().status !== 'ordered') {
        throw new Error('Only pending purchase orders can be marked as received.');
      }

      const items = (poSnap.data().items as PurchaseOrder['items']) ?? [];
      const prodSnaps = await Promise.all(
        items.map((i) => tx.get(doc(db!, 'businesses', businessId, 'products', i.productId)))
      );

      tx.update(poRef, {
        status: 'received',
        updatedAt: serverTimestamp(),
      });

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const snap = prodSnaps[idx];
        if (!snap.exists()) continue;
        const prev = Number(snap.data().stockQuantity ?? 0);
        const next = prev + item.quantity;
        tx.update(snap.ref, {
          stockQuantity: next,
          updatedAt: serverTimestamp(),
        });

        const movId = generateId('mov');
        tx.set(
          doc(db!, 'businesses', businessId, 'stockMovements', movId),
          omitUndefined({
            id: movId,
            businessId,
            productId: item.productId,
            productName: item.productName.slice(0, 140),
            locationId: poSnap.data().locationId ? String(poSnap.data().locationId) : undefined,
            type: 'purchase',
            quantityDelta: item.quantity,
            previousStock: prev,
            newStock: next,
            reason: `Received Purchase ${poSnap.data().purchaseNumber}`,
            referenceId: purchaseId,
            actorUid,
            actorName: actorName.slice(0, 120),
            createdAt: serverTimestamp(),
          })
        );
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function refundSaleInFirestore(businessId: string, saleId: string) {
  if (!db) return;
  const path = `businesses/${businessId}/sales/${saleId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'sales', saleId), {
      status: 'refunded',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveEmployeeInFirestore(
  businessId: string,
  employee: Omit<Employee, 'createdAt' | 'updatedAt'>,
  isNew: boolean
) {
  if (!db) return;
  const path = `businesses/${businessId}/employees/${employee.uid}`;
  const ref = doc(db, 'businesses', businessId, 'employees', employee.uid);
  try {
    if (isNew) {
      await setDoc(ref, {
        uid: employee.uid,
        businessId,
        name: employee.name.trim().slice(0, FIELD_LIMITS.NAME_MAX),
        email: employee.email.trim().slice(0, FIELD_LIMITS.EMAIL_MAX),
        role: employee.role,
        status: employee.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: employee.name.trim().slice(0, FIELD_LIMITS.NAME_MAX),
        email: employee.email.trim().slice(0, FIELD_LIMITS.EMAIL_MAX),
        role: employee.role,
        status: employee.status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function updateBusinessSettingsInFirestore(
  businessId: string,
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
) {
  if (!db) return;
  const path = `businesses/${businessId}`;
  try {
    await updateDoc(
      doc(db, 'businesses', businessId),
      omitUndefined({
        name: updates.name?.trim().slice(0, FIELD_LIMITS.NAME_MAX),
        businessType: updates.businessType,
        logoUrl: updates.logoUrl !== undefined ? cleanStr(updates.logoUrl, 500) : undefined,
        address: updates.address !== undefined ? cleanStr(updates.address, FIELD_LIMITS.ADDRESS_MAX) : undefined,
        phone: updates.phone !== undefined ? cleanStr(updates.phone, FIELD_LIMITS.PHONE_MAX) : undefined,
        email: updates.email !== undefined ? cleanStr(updates.email, FIELD_LIMITS.EMAIL_MAX) : undefined,
        currency: updates.currency,
        taxRate: updates.taxRate !== undefined ? Math.min(100, Math.max(0, Number(updates.taxRate))) : undefined,
        receiptHeader: updates.receiptHeader !== undefined ? cleanStr(updates.receiptHeader, 300) : undefined,
        receiptFooter: updates.receiptFooter !== undefined ? cleanStr(updates.receiptFooter, 300) : undefined,
        lowStockAlertEnabled: updates.lowStockAlertEnabled,
        lowStockAlertEmail:
          updates.lowStockAlertEmail !== undefined
            ? updates.lowStockAlertEmail.trim().slice(0, FIELD_LIMITS.EMAIL_MAX)
            : undefined,
        lowStockAlertTime:
          updates.lowStockAlertTime !== undefined
            ? updates.lowStockAlertTime.trim().slice(0, 10)
            : undefined,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
