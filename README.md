# NexPOS

**A modern point-of-sale and business operations platform.**

NexPOS is being developed as a multi-tenant POS and inventory management application for retail and service businesses. The project combines a React-based interface with a server-side API and a PostgreSQL data layer, with a staged migration from the original Firebase implementation to the V2 architecture.

> **Project status: Active development — V2 migration in progress.** The existing application still contains legacy Firebase authentication and data flows. The V2 workspace and API foundation are being built alongside that application; this repository should not yet be treated as a fully migrated or production-ready POS release.

---

## Contents

- [Highlights](#highlights)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [V2 implementation status](#v2-implementation-status)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [Available scripts](#available-scripts)
- [V2 routes](#v2-routes)
- [Security principles](#security-principles)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Highlights

The product direction includes:

- **Point of sale:** product-based and custom-item checkout, receipt records, payment method capture and server-calculated totals.
- **Product catalogue:** product details, SKUs, barcodes, pricing, categories and active/archive state.
- **Inventory operations:** stock levels, inventory locations and movement history.
- **Customer management:** customer contact records and sales associations.
- **Supplier management:** supplier records and purchasing workflows.
- **Purchasing:** purchase orders, receiving and stock updates.
- **Business workspaces:** separate business workspaces with membership-based access.
- **Staff management:** role-based memberships and invitation-based onboarding.
- **Business settings:** business profile, currency, tax and receipt-related settings.
- **Auditability:** business-scoped audit events and transactional records.

Feature availability depends on the selected application path. See [V2 implementation status](#v2-implementation-status) before relying on any feature in a live business.

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| UI and styling | Tailwind CSS 4, Lucide React, Motion |
| API hosting | Vercel Functions |
| Database | Neon PostgreSQL |
| Data access | Drizzle ORM and parameterized SQL |
| Authentication | Better Auth |
| Validation | Zod |
| Testing | Vitest |
| Development runtime and package manager | Bun |
| Legacy application services | Firebase |

## Architecture

The V2 target architecture is:

```text
Browser
  |
  v
React + TypeScript + Vite
  |
  | HTTPS / session cookies
  v
Vercel API Functions (/api)
  |
  +--> Better Auth (identity and sessions)
  |
  +--> Authorization and Zod validation
  |
  v
Neon PostgreSQL
  |
  +--> Tenant-scoped business data
  +--> PostgreSQL Row-Level Security
  +--> Transactional sales and inventory ledgers
  +--> Audit records
```

The browser does not establish database connections. Business operations are performed through server-side API routes. The API derives identity from the authenticated session, checks business membership and role, validates request data, and scopes database operations to the authorized business.

For more detail, see [docs/V2-ARCHITECTURE.md](docs/V2-ARCHITECTURE.md).

## V2 implementation status

V2 is an incremental migration, not a completed replacement of the legacy application.

| Area | Current implementation direction |
|---|---|
| Better Auth | V2 sign-in and sign-up flow |
| Business workspaces | Create/list businesses and load workspace snapshots |
| Products and categories | V2 API endpoints and client methods |
| Customers and suppliers | V2 API endpoints and client methods |
| Inventory locations | V2 API endpoints and client methods |
| Checkout and sales | Transactional V2 API foundation |
| Refunds | Explicit refund records and idempotency protections |
| Purchase orders | Purchase order and receiving API foundation |
| Staff | Membership management and invitation acceptance |
| Business settings | Role-protected settings API |
| Main POS UI migration | In progress; legacy Firebase context remains in the main application |
| Production readiness | Not yet verified |

### V2 entry points

- `/v2` — V2 sign-in/sign-up and business workspace selection.
- `/v2/employees` — V2 staff management.
- `/accept-invitation` — V2 staff invitation acceptance.

The V2 workspace flow is separate from the legacy Firebase sign-in. Do not assume a legacy Firebase account is automatically a V2 account.

**Invitation delivery:** the current invitation flow returns a one-time invitation link for secure manual sharing. Automated email delivery is not configured.

**Payments:** payment method capture in the application is not the same as payment gateway processing. No card acquiring, gateway settlement or automatic gateway refunds should be assumed.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) (recommended package manager)
- Node.js 22 or later
- A Neon PostgreSQL development database for V2 backend work
- A Better Auth secret for local V2 authentication

### 1. Clone the repository

```bash
git clone https://github.com/dionstacey03-dev/Nex-POS.git
cd Nex-POS
```

### 2. Install dependencies

```bash
bun install
```

### 3. Configure environment

Copy the example file:

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux**
```bash
cp .env.example .env
```

Add the values for the services you intend to run. Never commit a populated `.env` file.

### 4. Start the development server

```bash
bun run dev
```

The development server is configured through `scripts/dev-server.ts`. Use the local URL printed by the command.

### 5. Validate the project

```bash
bun run typecheck
bun run test
bun run build
```

A successful local build does not by itself verify database connectivity, authentication provider configuration or a deployed environment.

## Environment variables

The repository includes [`.env.example`](.env.example) as the canonical variable-name reference.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Neon connection string used by the application runtime |
| `APP_DB_ROLE` | Dedicated least-privilege runtime database role |
| `MIGRATION_DATABASE_URL` | Direct Neon connection string for schema migrations |
| `BETTER_AUTH_SECRET` | Secret used by Better Auth |
| `BETTER_AUTH_URL` | Canonical Better Auth application URL |
| `GOOGLE_CLIENT_ID` | Optional Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client secret |
| `ALLOW_PRODUCTION_MIGRATIONS` | Explicit safety gate for production migrations; keep `false` unless a production migration is separately approved |
| `GEMINI_API_KEY` | Optional server-side AI feature key |
| `VITE_BETTER_AUTH_URL` | Optional browser-visible Better Auth base URL; only use a public URL here |

**Important:** variables prefixed with `VITE_` are exposed to the browser bundle. Never put database URLs, authentication secrets, OAuth client secrets or private API keys in Vite-prefixed variables.

For local V2 development, use a disposable development database and a runtime database role that is not a superuser, table owner or `BYPASSRLS` role.

## Database and migrations

Versioned SQL migrations are stored in [`db/migrations/`](db/migrations/). The schema uses business IDs, composite foreign keys and PostgreSQL Row-Level Security (RLS) to help isolate tenant data.

Configure both database URLs and the runtime role before running migrations:

```bash
bun run db:migrate
```

The migration runner includes a production safety check. Production migrations are refused unless `ALLOW_PRODUCTION_MIGRATIONS=true` is explicitly set. Do not enable that flag for routine local development.

Recommended workflow:

1. Create a disposable Neon development database.
2. Configure `MIGRATION_DATABASE_URL` with the migration/owner connection.
3. Configure `DATABASE_URL` with a pooled, restricted runtime connection.
4. Set `APP_DB_ROLE` to the runtime role name.
5. Review the pending SQL migrations.
6. Run migrations against the development database.
7. Test authentication, tenant isolation and application flows before considering any production change.

Never use the migration owner credentials as the application runtime credentials.

## Available scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the local development server |
| `bun run build` | Type-check and create the Vite production build |
| `bun run preview` | Preview the built frontend locally |
| `bun run typecheck` | Run the TypeScript compiler without emitting files |
| `bun run test` | Run the Vitest test suite |
| `bun run test:watch` | Run Vitest in watch mode |
| `bun run db:generate` | Generate Drizzle migration artifacts |
| `bun run db:migrate` | Run the project's migration script |
| `bun run db:studio` | Open Drizzle Studio |

## Security principles

NexPOS V2 is designed around the following safeguards:

- **Server-verified identity:** user identity comes from the authenticated server session, not a client-supplied user ID.
- **Tenant isolation:** every business operation must verify active membership and scope data to the authorized business.
- **Role-based access:** privileged actions require the appropriate business role.
- **Database defence in depth:** tenant-owned tables use PostgreSQL RLS policies and business-scoped relationships.
- **Validated inputs:** API request bodies are validated at server boundaries.
- **Financial integrity:** checkout and inventory operations use database transactions, row locks and idempotency protections where implemented.
- **Auditability:** sensitive business actions create audit records.
- **Secret hygiene:** server secrets stay out of client bundles and source control.
- **Production safety:** deployment and production database changes are treated as separate, explicitly gated operations.

Review [`security_spec.md`](security_spec.md) and [`docs/V2-ARCHITECTURE.md`](docs/V2-ARCHITECTURE.md) for additional implementation details. Security controls must still be tested against the deployed configuration; documentation is not a substitute for verification.

## Deployment

The frontend and API are designed for **Vercel**, with **Neon PostgreSQL** as the V2 database.

For a Vercel preview environment:

1. Import the GitHub repository into Vercel.
2. Confirm the project root, Vite framework, build command and output directory.
3. Configure the required V2 environment variables in the Preview environment.
4. Connect a non-production Neon database.
5. Deploy a feature/remediation branch as a Preview deployment.
6. Verify build output, API routes, Better Auth callbacks, database access, RLS and core workflows.

Do not point a preview deployment at production data. Do not run production migrations or promote a preview to production without a separate review and explicit approval.

## Roadmap

- [x] Establish the Vercel + Neon V2 architecture foundation.
- [x] Add Better Auth and business workspace bootstrap.
- [x] Build foundational tenant-scoped APIs for core business resources.
- [x] Add staff membership and invitation foundations.
- [ ] Complete migration of the main POS UI away from Firebase.
- [ ] Finish end-to-end tests against a disposable Neon environment.
- [ ] Verify all role permissions and tenant-isolation scenarios.
- [ ] Configure and validate invitation email delivery.
- [ ] Complete Vercel Preview deployment validation.
- [ ] Plan and review a controlled legacy-data migration.
- [ ] Complete production readiness review before any production release.

## Contributing

Contributions should be made through focused branches and pull requests.

1. Create a branch from the agreed development base.
2. Keep changes scoped and include tests where appropriate.
3. Run type-checking, tests and a production build.
4. Document environment or migration changes.
5. Never include secrets, real customer data or production database exports.
6. Do not deploy production or run production migrations as part of an ordinary code change.

## License

No license has currently been declared in this repository. All rights are reserved by default unless the repository owner adds a license file.
