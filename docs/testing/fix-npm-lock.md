# Fix test steps: package-lock.json written by npm 11.6.2

Problem reported by Sifat on 2026-11-28: after `git pull` and `npm install` on `main`, `git status` showed `package-lock.json` as modified.

Cause: the laptops run npm 11.6.2 (it comes with Node.js 24), but the lock file in `main` was written by a newer npm 11.
- F12 added Playwright with a newer npm 11 (11.21), which removed 18 `"peer": true` lines that npm 11.6.2 writes.
- PR #8 had added `@emnapi/core` and `@emnapi/runtime` entries for `npm ci` on npm 11.21; npm 11.6.2 removes them on every install.

Fix: `package-lock.json` is now exactly what npm 11.6.2 writes. No package changes version (checked entry by entry; only the two `@emnapi` entries go, and npm 11.6.2 never installed them). CLAUDE.md now says which npm writes the lock file.

No code or database change. Vercel's preview build of this pull request must pass.

## 1. Laptop (Git Bash, Node 24 with npm 11.6.2)
| # | Step | Expected |
|---|---|---|
| 1.1 | `node -v` and `npm -v` | v24.x and 11.6.2 |
| 1.2 | `git status` | Clean. If only `package-lock.json` is modified, run `git restore package-lock.json` first |
| 1.3 | `git fetch origin` and `git checkout chore/npm-lock-11-6-2` | Switched to the branch |
| 1.4 | `npm install` | Finishes without errors (the 9 audit warnings are a separate task) |
| 1.5 | `git status` | **nothing to commit, working tree clean** |
| 1.6 | `npm ci` | Finishes without "lock file out of sync" or "Missing: ..." |
| 1.7 | `git status` | Still clean |
| 1.8 | `npm run dev`, open http://localhost:3000/bn | The home page opens as before |

## 2. Preview
| # | Step | Expected |
|---|---|---|
| 2.1 | The pull request's Vercel check | Ready (green) |
| 2.2 | Open the preview's `/bn` and `/bn/ads` | Same as the live site |

## 3. After the merge
| # | Step | Expected |
|---|---|---|
| 3.1 | `git checkout main`, `git pull`, `npm install`, `git status` | Clean |
| 3.2 | Each teammate on their own laptop: `git pull`, `npm install`, `git status` | Clean (if a teammate has a newer npm than 11.6.2, `npm -v` shows it; tell Claude) |
