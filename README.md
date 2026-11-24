# NexPOS

**One Platform. Every Transaction.**

NexPOS is a React and TypeScript point-of-sale and business-management application for retail and other small-business workflows. The repository includes a Vite frontend, an Express development/server entry point, Firebase Authentication and Cloud Firestore integration, Firestore security rules, and a Gemini-powered stock-forecast endpoint.

## Current modules

- Point-of-sale terminal and sales history
- Products, inventory, categories, locations, and stock movements
- Customers, suppliers, and purchase orders
- Employee management with owner, admin, manager, and cashier roles
- Dashboard, reporting, and inventory projections
- Internationalized interface and currency utilities
- AI-assisted stock forecasting through the server API

The application source is the authoritative reference for current functionality. Treat sample data and AI forecasts as decision support, not as a substitute for inventory reconciliation.

## Technology

- React 19, TypeScript, Vite 8
- Tailwind CSS 4, Motion, Lucide React
- Firebase Authentication and Cloud Firestore
- Express and Google Gemini API
- Firestore Security Rules in `firestore.rules`

## Getting started

### Requirements

- Node.js compatible with Vite 8
- npm

### Install

```bash
npm ci
```

### Configure

Copy `.env.example` to `.env` for local development and provide a server-side `GEMINI_API_KEY` to enable AI stock forecasting. Never place this key in a `VITE_*` variable or expose it in browser code.

Review `firebase-applet-config.json` and confirm it points to the intended Firebase project. Before using real Firestore data, publish the repository's `firestore.rules` to that project and verify the active rules in the Firebase console.

### Run the development server

```bash
npm run dev
```

The development command starts the Express server with Vite middleware. Open the local URL printed by the server.

### Build and type-check

```bash
npm run build
npm run lint
```

- `npm run build` creates the Vite production frontend.
- `npm run lint` runs the TypeScript no-emit check.
- No automated test script is currently defined in `package.json`.

## Security and deployment notes

- Firestore authorization depends on the deployed rules, not on UI visibility. Review `security_spec.md` alongside `firestore.rules` before changing roles or data access.
- The AI stock-forecast route uses a server-side Gemini key but currently has no user-authentication or shared rate-limit layer. Do not expose it as an unrestricted public production endpoint; add verified identity and shared abuse controls before public launch.
- The client writes sales, stock, and audit records through Firestore. Review the limits documented in the security audit before treating client-submitted financial totals as authoritative.
- Do not commit service-account credentials, private keys, or production secrets.
- This repository does not currently include a CI workflow or automated Firestore Emulator Suite tests.

## Project status

This repository is under active development and audit. A successful frontend build alone does not verify Firebase authorization, server-side AI access, inventory transaction integrity, or production readiness.
