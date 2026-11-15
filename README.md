# NexPOS

**One Platform. Every Transaction.**

NexPOS is a universal point-of-sale and business-management application built for retail stores, cafés, pharmacies, apparel businesses, electronics shops, and other small and medium-sized businesses.

## Current capabilities

- Business workspaces with owner, administrator, manager, and cashier roles
- Dashboard, POS terminal, product and category management
- Inventory adjustments, stock movement history, and low-stock visibility
- Customer and supplier records
- Purchase orders, sales history, reports, and settings
- Firebase Authentication and Cloud Firestore
- Trusted server-side checkout, refunds, purchase receiving, and stock adjustments using Firestore REST commits with document-version preconditions
- Demo mode with sample data when cloud mode is not configured
- AI-assisted inventory restock forecasting through a server-side Gemini endpoint
- Touch-friendly interactions, barcode entry, receipt printing, themes, and optional haptic/audio feedback

## Technology

- React 19, TypeScript, Vite 8
- Tailwind CSS 4 and Lucide React
- Firebase Authentication and Cloud Firestore
- Express and the Google GenAI SDK for the server-side stock forecast endpoint

## Requirements

- Node.js 22 or newer (Vite 8 requires a modern Node.js runtime)
- Bun (recommended because the repository includes `bun.lock`), or npm

## Local development

1. Clone the repository:

   ```bash
   git clone https://github.com/dionstacey03-dev/Nex-POS.git
   cd Nex-POS
   ```

2. Install dependencies:

   ```bash
   bun install --frozen-lockfile
   ```

   With npm, use `npm install`.

3. Copy `.env.example` to `.env`. Configure the Firebase service account for trusted POS operations and the Gemini key if AI forecasting is required:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```

   `FIREBASE_SERVICE_ACCOUNT_JSON` must contain the complete one-line service-account JSON for the same Firebase project. Create a dedicated service account for the same Firebase project, grant it the Firestore/Datastore permissions needed to read and commit documents (for example, the Firestore User role), store the value only in `.env` or the hosting provider's secret manager, and never expose it through a `VITE_` variable. Never commit `.env`, service-account files, private keys, or other credentials.

4. Start the application:

   ```bash
   bun run dev
   ```

   The app is served locally by the Express/Vite development server (default port 3000).

## Firebase setup

The browser Firebase app configuration is read from `firebase-applet-config.json`. Replace the sample/project-specific configuration with your own Firebase project's **web app configuration** before using your own production project.

1. Create a Firebase project and register a web app.
2. Enable Google as an Authentication provider and configure the authorized domains.
3. Create the Firestore database using the database ID configured for the app.
4. Review and deploy `firestore.rules` to that exact database.
5. Configure Firebase API-key restrictions and authentication settings for your deployed domains.
6. Create the first business workspace using an authenticated, verified account.

Firebase web API keys identify a Firebase project; they are not service-account secrets. Still apply API restrictions and never expose Admin SDK credentials in the client.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Express server with Vite middleware |
| `bun run typecheck` | Run TypeScript checks |
| `bun run build` | Type-check and create the production Vite bundle |
| `bun run start` | Start the Express server |
| `bun run preview` | Preview the Vite production bundle |
| `bun run clean` | Remove the generated `dist` directory |

## Trusted POS transaction API

The Express server exposes authenticated endpoints for checkout, refunds, stock adjustments, and purchase receiving. Each request must include a Firebase ID token. The server verifies the token and active employee role, then uses the server-only service account to read authoritative prices/stock and commit related records atomically with Firestore document-version preconditions. This prevents browser clients from directly changing the sales ledger, stock ledger, inventory quantities, or customer financial totals.

The trusted endpoints require `FIREBASE_SERVICE_ACCOUNT_JSON`. If this secret is absent or invalid, these operations fail closed; demo mode remains available. Deploy the updated `firestore.rules` to the exact configured database before testing cloud mode. Never use a broad owner key in client code.

## AI stock forecasting

The endpoint `POST /api/ai/stock-forecast` uses the server-side `GEMINI_API_KEY`. Configure that secret in the hosting provider's secret manager; do not place it in Vite client variables (for example, variables prefixed with `VITE_`).

AI output is advisory. Verify purchase quantities and supplier lead times before placing an order.

## Security and production checklist

- [ ] Replace the Firebase web app configuration with the intended project configuration.
- [ ] Deploy and test Firestore rules with the Firebase Emulator Suite and adversarial test cases.
- [ ] Configure verified authentication and authorized domains.
- [x] AI stock-forecast endpoint verifies Firebase ID tokens and checks active membership in the requested business workspace.
- [ ] Add a distributed edge/API-gateway quota, monitoring, and cost limits for Gemini usage; the in-process limiter is only a secondary safeguard.
- [ ] Configure `TRUST_PROXY=1` only when the app is deployed behind one trusted reverse proxy.
- [ ] Configure HTTPS, environment secrets, backups, and production monitoring.
- [x] Browser clients cannot directly write sales, stock movements, stock quantities, or customer financial aggregates; trusted server endpoints handle checkout, refunds, purchase receiving, and stock adjustments.
- [ ] Configure `FIREBASE_SERVICE_ACCOUNT_JSON` in the server secret manager and test all trusted endpoints against the intended Firebase project.
- [ ] Test concurrent checkouts, refunds, stock adjustments, and purchase-order receiving using concurrent requests and stale document versions.
- [ ] Confirm that payment methods labelled card/other are only recorded as payment methods; no card processing occurs without a payment gateway integration.

## Important

NexPOS is under active development. A successful frontend build does not by itself certify Firestore rules, payment flows, AI forecasts, or production deployment. Complete the security checklist and run end-to-end tests before using it for live transactions.
