# House Manager

Broker-free rental platform for Bangladesh, starting in Mirpur, Dhaka.
CSE 400 (Software Development IV), Fall 2026, BUBT.

- Plan: [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)
- Accounts and tools: [docs/SETUP.md](docs/SETUP.md)
- Test steps per feature: [docs/testing/](docs/testing/)

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui style components, next-intl (Bangla and English), Supabase (Postgres with RLS, Auth, Storage), Vercel.

## Run it locally

You need Node.js 24 LTS and the dev Supabase project's URL and publishable key (ask Sifat).

```bash
git clone https://github.com/house-manager-bd/house-manager.git
cd house-manager
npm install
cp .env.example .env.local     # then fill in the two Supabase values
npm run dev
```

Open http://localhost:3000. It redirects to `/bn`. Use the language button in the header for `/en`.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build (run before opening a pull request) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Database

Migrations live in `supabase/migrations/`. Apply them to the dev project in one of two ways:

- **SQL Editor** (simplest): open the Supabase dashboard, SQL Editor, paste the migration file and run it once.
- **Supabase CLI**: `npx supabase login`, `npx supabase link --project-ref <dev-ref>`, then `npx supabase db push`.

Pick one way per project and stick to it, so migrations are not applied twice.

## Folder map

```
messages/            bn.json and en.json, every UI string
src/app/[locale]/    pages (bn and en)
src/app/auth/        auth callback (email links, Google)
src/components/      ui/ (buttons, inputs), layout/, auth/, dashboard/, profile/
src/i18n/            next-intl routing and navigation
src/lib/             supabase clients, server actions, validation, helpers
src/proxy.ts         language redirect, session refresh, protected pages
supabase/migrations/ SQL migrations with RLS
```
