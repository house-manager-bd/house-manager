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
- Use Node.js 24 with its npm 11 (the team's laptops and Vercel). npm 10 writes package-lock.json differently, which shows up as a changed file after every install.
- package-lock.json is written by npm 11.6.2, the npm that comes with Node.js 24. Newer npm 11 versions write it differently too (no `"peer": true` lines, two extra `@emnapi` entries). When changing dependencies anywhere but a team laptop, run npm as `npx -y npm@11.6.2 ...`, and check that `npx -y npm@11.6.2 install` leaves the lock file unchanged before committing. `npm ci` with a newer npm (seen with 11.21) stops with "Missing: @emnapi/... from lock file"; use `npx -y npm@11.6.2 ci` there.
