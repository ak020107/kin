# Kin

A synthetic-data family care coordination prototype.

Live demo: https://kin-seven-tau.vercel.app

Kin organizes sourced records, personal conversation, proactive preparation and Today cards. It supports persistent in-app reminders, family messages and tasks, selected snapshot sharing, transactional sandbox reservations and owner-reviewed emergency cards.

## Scope

All record scenarios and reservations are fictional. FinchNode provides synthetic records; Kin also includes explicitly labeled authored simulations. Record retrieval does not verify current medication use or medication taking. AI explanations are not clinical verification. Emergency cards are self-reported, selected family snapshots, not verified medical records.

There is no real provider booking, external calendar or Gmail integration, voice interface, native widget, verified medication adherence, or closed-app notification delivery. Reminders surface while Kin is open or when returning. The separate widget concept is not part of this app.

Saved demo profiles use this browser's storage and database-issued bearer credentials. Anyone with access to that browser may open its saved profiles. This is demo convenience, not production sign-in or secure cross-device recovery. Family history, approved snapshots and published emergency cards are visible to current family members, including later joiners. Removing or changing sharing cannot recall previously seen content. Use synthetic information only.

## Stack

React 19, TypeScript, Vite 8, Tailwind CSS, Node.js, Gemini, FinchNode synthetic APIs, SpacetimeDB 2.10.2, and Vercel. The hosted demo uses SpacetimeDB Maincloud. The instructions below create a separate local database.

## Prerequisites

- Node.js 22.12 or newer within the 22.x release line.
- pnpm (the project includes pnpm lockfiles).
- SpacetimeDB CLI 2.10.2 for the full application.
- A Gemini API key for AI replies. An optional FinchNode sandbox key enables account-backed synthetic Connect scenarios.

## Install and preview

```sh
pnpm install --frozen-lockfile
pnpm --dir spacetimedb/spacetimedb install --frozen-lockfile
```

Copy `.env.example` to `.env.local` for frontend settings and `.env.server.example` to `.env.server` for server settings. Enter private provider keys only in `.env.server` or server environment variables. Never use a `VITE_` prefix for secrets.

A UI-only fixture preview can run without database or provider credentials:

```sh
pnpm dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173/?fixtures=1`. This preview uses fixtures and does not demonstrate backend persistence or authorization.

## Full local application

Start a separate local SpacetimeDB instance in a terminal:

```sh
spacetime start --listen-addr 127.0.0.1:3000 --data-dir .kin-data --non-interactive
```

From the repository root, provision a local service identity. This writes an ignored bearer-token file and updates the module's public service identity. Then publish to the local server:

```sh
node server/provision.mjs
spacetime publish --server http://127.0.0.1:3000 --module-path spacetimedb/spacetimedb kin-local
```

Use a new database name and update the frontend/server settings if `kin-local` already belongs to another project. Do not delete or overwrite an existing database. Run the API and frontend in separate terminals:

```sh
pnpm server
pnpm dev --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`. The API defaults to loopback port 3001; Vite proxies `/api` to it. Separate browser tabs can represent independent synthetic profiles. Generated client bindings are included. After changing the database schema, regenerate them:

```sh
spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb/spacetimedb
```

## Checks and production build

```sh
pnpm lint
pnpm build
pnpm test:today
pnpm test:mentions
pnpm test:prompts
pnpm exec tsx tests/profile-names.ts
```

`build` type-checks the application, creates the Vite bundle and generates `api/kin.mjs` from the shared server handler. The generated API bundle is not committed. Additional scripts in `package.json` exercise live database/Gemini workflows; they require a separate configured synthetic test environment and can create test records. Do not run them against the hosted demo or another active database.

## Hosting configuration

Vercel serves the frontend and generated Node API function. The hosted database is separate from local development. Public frontend settings are `VITE_SPACETIME_URI` and `VITE_SPACETIME_DATABASE`. Server settings are `SPACETIME_URI`, `SPACETIME_DATABASE`, `KIN_SERVICE_TOKEN`, `KIN_ALLOWED_ORIGINS`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and optionally `FINCHNODE_API_KEY`.

Provision a distinct service identity for your own database, configure its public identity in `spacetimedb/spacetimedb/src/service-identity.ts`, and store its bearer token only in server settings. Origin allowlisting should contain your exact deployed HTTPS origin. This repository does not contain the hosted demo's credentials or exported profiles. Publishing source does not deploy or change the existing demo.

## Repository contents

Application source, database module, generated client bindings, source assets, tests, package lockfiles and build configuration are included. Environment secrets, service sessions, exported profiles, databases, logs, local tooling, review screenshots and build outputs are excluded. No project license has been selected.
