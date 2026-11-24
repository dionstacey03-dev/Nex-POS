import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const projectId = 'demo-nexpos';
const databaseId = 'ai-studio-13aeaff3-6798-41a6-a62d-e5b290d08731';
let testEnv;
const now = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'));

function context(uid) {
  return testEnv.authenticatedContext(uid, { email_verified: true }).firestore(databaseId);
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore(databaseId);
    await setDoc(doc(db, 'businesses/biz1'), {
      id: 'biz1', name: 'Test Business', businessType: 'retail', ownerUid: 'owner1',
      currency: 'LKR', taxRate: 0, createdAt: now, updatedAt: now,
    });
    for (const [uid, role] of [['owner1', 'owner'], ['admin1', 'admin'], ['manager1', 'manager'], ['cashier1', 'cashier']]) {
      await setDoc(doc(db, `businesses/biz1/employees/${uid}`), {
        uid, businessId: 'biz1', name: uid, email: `${uid}@example.test`, role,
        status: 'active', createdAt: now, updatedAt: now,
      });
    }
    await setDoc(doc(db, 'businesses/biz1/products/product1'), {
      id: 'product1', businessId: 'biz1', name: 'Test Product', categoryId: 'general',
      sku: 'TEST-1', purchasePrice: 10, sellingPrice: 20, stockQuantity: 5,
      minStockLevel: 1, active: true, createdAt: now, updatedAt: now,
    });
    await setDoc(doc(db, 'businesses/biz1/customers/customer1'), {
      id: 'customer1', businessId: 'biz1', name: 'Test Customer', totalSpent: 100,
      ordersCount: 2, createdAt: now, updatedAt: now,
    });
    await setDoc(doc(db, 'businesses/biz2'), {
      id: 'biz2', name: 'Other Business', businessType: 'retail', ownerUid: 'otherOwner',
      currency: 'LKR', taxRate: 0, createdAt: now, updatedAt: now,
    });
    await setDoc(doc(db, 'businesses/biz2/products/secretProduct'), {
      id: 'secretProduct', businessId: 'biz2', name: 'Private Product', categoryId: 'general',
      sku: 'PRIVATE-1', purchasePrice: 10, sellingPrice: 20, stockQuantity: 5,
      minStockLevel: 1, active: true, createdAt: now, updatedAt: now,
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
  await seed();
});

after(async () => {
  await testEnv?.cleanup();
});

test('cashier cannot change product stock directly', async () => {
  await assertFails(updateDoc(doc(context('cashier1'), 'businesses/biz1/products/product1'), {
    stockQuantity: 999, updatedAt: serverTimestamp(),
  }));
});

test('owner can edit product metadata without changing stock', async () => {
  await assertSucceeds(updateDoc(doc(context('owner1'), 'businesses/biz1/products/product1'), {
    name: 'Updated Product Name', updatedAt: serverTimestamp(),
  }));
});

test('browser clients cannot create sales ledger records', async () => {
  await assertFails(setDoc(doc(context('cashier1'), 'businesses/biz1/sales/forged-sale'), {
    id: 'forged-sale', businessId: 'biz1',
  }));
});

test('browser clients cannot forge stock movement records', async () => {
  await assertFails(setDoc(doc(context('cashier1'), 'businesses/biz1/stockMovements/forged-movement'), {
    id: 'forged-movement', businessId: 'biz1', quantityDelta: 1000,
  }));
});

test('manager cannot change customer financial aggregates', async () => {
  await assertFails(updateDoc(doc(context('manager1'), 'businesses/biz1/customers/customer1'), {
    totalSpent: 999999, updatedAt: serverTimestamp(),
  }));
});

test('admin cannot promote their own employee record', async () => {
  await assertFails(updateDoc(doc(context('admin1'), 'businesses/biz1/employees/admin1'), {
    role: 'owner', updatedAt: serverTimestamp(),
  }));
});

test('cashier cannot read another business product', async () => {
  await assertFails(getDoc(doc(context('cashier1'), 'businesses/biz2/products/secretProduct')));
});

test('cashier cannot create purchase orders', async () => {
  await assertFails(setDoc(doc(context('cashier1'), 'businesses/biz1/purchases/forged-purchase'), {
    id: 'forged-purchase', businessId: 'biz1', status: 'received',
  }));
});
