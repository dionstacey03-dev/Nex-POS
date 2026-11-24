# NexPOS Security Specification

## 1. Data Invariants
1. **Tenant Isolation**: Every business record (`categories`, `locations`, `products`, `customers`, `suppliers`, `sales`, `stockMovements`, `purchases`, `employees`) is strictly scoped under `/businesses/{businessId}` and enforces `data.businessId == businessId` on creation and immutability on update.
2. **Identity & Privilege Integrity**: Users cannot self-assign `owner` or `admin` roles on another user's business. Only `owner` or `admin` staff members can create, modify, or deactivate `employees` or update sensitive `Business` settings.
3. **Cashier Least Privilege**: Cashiers (`role == 'cashier'`) can use the authenticated server-side checkout endpoint. They cannot directly create sales or stock movement documents, directly change product stock, or modify customer financial aggregates from the browser. The server derives prices and stock from Firestore and commits the sale, stock movements, inventory changes, and customer aggregates atomically. Cashiers cannot apply discounts or add custom-priced items; those actions require manager-level permission.
4. **Immutable Audit Logs**: Completed `sales` and `stockMovements` are written only by the trusted server transaction API; direct client creates, updates, and deletes are denied.
5. **Temporal Integrity**: Client-writable documents use server timestamps and immutable creation times. Trusted server writes use the server clock and Firestore update-time preconditions.
6. **PII Isolation**: User profiles under `/users/{userId}` and `/users/{userId}/memberships/{businessId}` are readable and writable only by `request.auth.uid == userId`.

## 2. Dirty Dozen Adversarial Payloads
1. **Cross-Tenant Read/Write**: Signed-in user A tries to read/write `/businesses/biz-B/products/prod-1` where A is not an active employee of `biz-B`. -> `PERMISSION_DENIED`.
2. **Self-Promotion Attack**: Cashier tries to update `/businesses/biz-1/employees/{cashierUid}` to `{ role: 'owner' }`. -> `PERMISSION_DENIED`.
3. **Shadow Field Injection**: User includes `isSuperAdmin: true` in a `Product` or `UserProfile` write. -> `PERMISSION_DENIED` (`hasOnly` rejects).
4. **Unverified Email Spoof**: User with `email_verified: false` attempts to write a business or product. -> `PERMISSION_DENIED`.
5. **Path ID Poisoning**: Attacker writes to `/businesses/../../etc/passwd` or a 500-char doc ID. -> `PERMISSION_DENIED` (`isValidId` rejects).
6. **Client Timestamp Forgery**: Client submits `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`. -> `PERMISSION_DENIED`.
7. **Cashier Price Tampering**: Cashier attempts to update `sellingPrice` on `/businesses/biz-1/products/prod-1`. -> `PERMISSION_DENIED` (`affectedKeys().hasOnly(['stockQuantity', 'updatedAt'])` rejects).
8. **Sale Immutability Breach**: Cashier attempts to delete or alter `grandTotal` on a completed sale. -> `PERMISSION_DENIED`.
9. **Value Poisoning**: Client submits a 10KB string for `sku` or negative `grandTotal` / invalid type `sellingPrice: "free"`. -> `PERMISSION_DENIED`.
10. **PII Blanket Scraping**: Authenticated user B attempts `list` or `get` on `/users` or `/users/user-A`. -> `PERMISSION_DENIED`.
11. **Owner Hijack on Update**: Admin attempts to change `ownerUid` on `/businesses/biz-1`. -> `PERMISSION_DENIED`.
12. **Unbounded Array Exhaustion**: Client attempts to create a Sale with 500 items or non-map items. -> `PERMISSION_DENIED`.


## 3. AI Forecast API Access
1. The `POST /api/ai/stock-forecast` endpoint requires a Firebase ID token in the Authorization bearer header.
2. The server verifies the RS256 signature against Google's published Firebase Secure Token certificates and validates issuer, audience, subject, issue time, and expiry against the configured Firebase project.
3. The server checks the authenticated user's own employee document through Firestore REST and requires `status == active` for the requested business before calling Gemini.
4. Requests are size-limited, capped at 40 SKU metrics, normalized to bounded values, and throttled per client IP in-process.
5. The in-process throttle is not a distributed quota. Production Cloud Run deployments must also configure Cloud Armor/API Gateway quotas, monitoring, and Gemini spend limits.
6. Never accept a business role, UID, or tenant identity from the request body as proof of authorization; derive identity from the verified token and membership document.


## 4. Trusted POS Transaction API
1. `POST /api/businesses/:businessId/checkout` is the only browser-facing path for checkout. It requires a verified Firebase ID token and an active employee role; product prices, tax rate, and stock are read from Firestore rather than trusted from the browser.
2. `POST /api/businesses/:businessId/products/:productId/stock-adjustments`, `POST /api/businesses/:businessId/sales/:saleId/refund`, and `POST /api/businesses/:businessId/purchases/:purchaseId/receive` are trusted server operations with role checks and Firestore update-time preconditions.
3. The server uses its Cloud Run runtime identity (Application Default Credentials) or a local-only service-account JSON fallback. Server REST writes bypass Firestore Security Rules; IAM permissions on the runtime identity are therefore part of the security boundary.
4. Deploy the backend to Cloud Run and test it in staging before deploying the restrictive Firestore rules to the configured named database. A static Vite deployment does not execute `server.ts`.
5. Card and other non-cash tender must equal the full sale total. NexPOS records the payment method/reference but does not itself process card payments or verify an external terminal settlement.
