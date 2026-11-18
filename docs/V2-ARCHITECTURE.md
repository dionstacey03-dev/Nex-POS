# NexPOS V2 — Vercel + Neon

This branch is the isolated V2 implementation track. It starts from `main` and does not include or modify the Firebase production-readiness PR.

## Target architecture

- **Frontend:** existing React 19 + TypeScript + Vite application.
- **Hosting/API:** Vercel static frontend plus Node.js serverless API functions under `/api`.
- **Database:** Neon PostgreSQL using pooled server-side connections.
- **ORM/migrations:** Drizzle ORM and versioned SQL migrations.
- **Authentication:** Better Auth with database-backed sessions and Google OAuth support.
- **Authorization:** server-verified membership and role checks for every business-scoped operation.
- **Validation:** Zod schemas at API boundaries.
- **Financial integrity:** PostgreSQL transactions, row locks, unique idempotency keys, immutable sale/inventory ledgers, and explicit refund records.

## Security invariants

1. Never trust business IDs, roles, prices, totals, stock values, user IDs, or permissions supplied by the browser.
2. Derive the user identity from the authenticated server session.
3. Verify active membership and required role before touching tenant data.
4. Scope every query and mutation by the authorized business ID.
5. Use parameterized SQL only.
6. Checkout locks product rows in a deterministic order, recalculates prices and totals on the server, and commits the sale, sale lines, stock decrements, movement ledger, customer effects, and idempotency record in one transaction.
7. Refunds are separate immutable records; they do not pretend to send money to a card. Cash/manual refunds require an explicit method and reference. Gateway refunds require a provider integration and reconciliation.
8. Use a transaction-local `SET LOCAL app.business_id` for PostgreSQL row-level security. Do not rely on RLS as a substitute for application authorization.
9. Secrets are server-only: `DATABASE_URL`, Better Auth secret, and OAuth credentials must never use a `VITE_` prefix.
10. Do not deploy, run production migrations, or change live data without explicit approval.

## Database

The baseline schema is in `db/migrations/0001_initial.sql`. Review and apply it only to a disposable Neon development database first. The schema enables RLS for tenant-owned tables and uses composite foreign keys to prevent cross-business references.

Important: the migration intentionally does not create Better Auth's user/session/account/verification tables. Those must be generated from the exact Better Auth version installed, reviewed, and added as a separate migration before auth is enabled.

## Environment

Copy `.env.example` and configure a Neon development database and Better Auth secrets locally. Do not put secrets in client-side variables or commit a populated `.env`.

## Migration plan

1. Add database and authentication foundation; verify schema against Neon development.
2. Add tenant membership and server authorization helpers.
3. Implement product/category/customer/supplier CRUD APIs.
4. Implement checkout and inventory ledger transactions with concurrency and idempotency tests.
5. Implement purchase orders, partial receiving, returns/refunds and reporting.
6. Replace Firebase data/auth adapters in the React context and preserve the existing UI.
7. Add import tooling and a dry-run Firebase export mapping; no production import without approval.
8. Add Vercel preview configuration and validate preview deployments; production deployment remains gated.

## Validation status

This is an architecture foundation, not a production-ready release. Database migrations, auth schema generation, lockfile regeneration, automated tests, and Vercel preview validation remain required before the branch can be considered deployable.
