@AGENTS.md

# House Manager: working rules

- Read `docs/PROJECT_PLAN.md` before starting a feature. One feature per branch and pull request (`feat/f2-...`).
- No em dashes anywhere (code comments, UI text, docs).
- Never mix Bangla and English in the same sentence. All UI text lives in `messages/bn.json` and `messages/en.json`, with the same keys in both.
- Every new table gets Row Level Security and its policies in the same migration (`supabase/migrations/`).
- Server-side checks always repeat client-side checks (shared zod schemas in `src/lib/validation/`).
- Never put the Supabase secret key, database password or any other secret in the repo.
- Middleware is called `proxy` in Next.js 16 (`src/proxy.ts`). Request APIs (`params`, `cookies()`, `headers()`) are async.
- Every change comes with test steps (see `docs/testing/`).
