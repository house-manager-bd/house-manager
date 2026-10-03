# SETUP.md: House Manager accounts and tools
Last updated: 2026-10-03
Put this file in the repo at docs/SETUP.md.

Free tiers and dashboard menus change often. If a button name differs slightly from this guide, look for the closest match.

## Who does what

| Step | Who | Time |
|---|---|---|
| 0. Project Gmail | Sifat | 10 min |
| 1. GitHub (old repo, organization, new repo) | Sifat, then teammates accept invites | 20 min |
| 2. Tools on each laptop | Everyone | 30 min |
| 3. Supabase (dev and demo projects) | Sifat | 20 min |
| 4. Vercel | Sifat | 5 min |
| 5. Google sign-in | Sifat | 20 min |
| 6. Email sending (SMTP) | Sifat | 15 min |
| 7. Secrets and the .env file | Sifat shares, everyone uses | 10 min |

---

## 0. Create a project Gmail (Sifat)

Create one Gmail account for the project, for example `housemanager.bubt@gmail.com`. It will own the Google sign-in setup and send the sign-up emails. Using a project account keeps your personal Gmail out of it, and the team can keep using it after the course.

- Turn on 2-Step Verification for it (Google Account, Security). Step 6 needs this.
- Save its password in a password manager (Bitwarden free works).

---

## 1. GitHub

### 1.1 The old Flutter repo
You already own `gitsifat091/house-manager` (Flutter). Keep it, but rename it so the names don't get confusing:

1. Open the repo on GitHub, go to **Settings**, then **General**.
2. Change **Repository name** to `house-manager-flutter` and click **Rename**. GitHub redirects old links automatically.
3. If you will not work on it again, scroll down to **Danger Zone** and click **Archive this repository**. It becomes read-only, and you can unarchive it any time. If it might become the future House Manager mobile app, leave it unarchived.

### 1.2 Why the new repo goes in a public organization
Vercel's free Hobby plan has two limits that matter for a team of five:
- It cannot deploy a **private** repo owned by a GitHub **organization**. Public organization repos are allowed.
- For a **private** repo, only the Hobby account owner's commits trigger deployments. Your teammates' pushes would be blocked.

A **public repo inside a free GitHub organization** avoids both, and gives all five of you a project for your GitHub profiles. Public is safe as long as secrets never go into the code (section 7). If you later run this as a business, move to a private repo with a paid plan.

### 1.3 Create the organization and repo
1. Click your profile picture, **Your organizations**, **New organization**, choose **Free**.
2. Name it, for example `house-manager-bd`. Contact email: the project Gmail. Choose "My personal account".
3. Invite members: Ushno, Mollika, Shihab, Sulaiman (by GitHub username or email). Give them the **Member** role, you stay **Owner**.
4. In the organization, click **New repository**:
   - Name: `house-manager`
   - Visibility: **Public**
   - Tick **Add a README**
   - **.gitignore template**: Node
   - License: MIT, or none if sir prefers
5. In the repo, go to **Settings**, **Rules**, **Rulesets**, **New branch ruleset**:
   - Name: `protect-main`, Enforcement: Active, Target: default branch
   - Tick **Require a pull request before merging**, required approvals: 1
   - Tick **Block force pushes**
   - Save. Now nobody can push straight to `main`, every change goes through a reviewed pull request.
6. Create a `docs` folder and add `PROJECT_PLAN.md` and this `SETUP.md` (use **Add file**, **Upload files**, through a pull request).

**Each teammate:** accept the organization invite from email or github.com/orgs/house-manager-bd.

---

## 2. Tools on every laptop (everyone, Windows)

1. **Node.js 24 LTS** from nodejs.org, the Windows Installer (.msi). Choose the version marked LTS. Node 26 becomes LTS on 28 October 2026. Staying on 24 is fine for this project, just make sure all five of you use the same major version.
2. **Git for Windows** from git-scm.com. Keep the default options. When asked for the default editor, choose VS Code.
3. **VS Code** from code.visualstudio.com. Install these extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Supabase, GitHub Pull Requests, Mermaid preview (any "Markdown Preview Mermaid Support").
4. Open **Git Bash** or the VS Code terminal and set your identity. Use the **same email as your GitHub account**, or your commits will not link to you:
   ```
   git config --global user.name "Your Name"
   git config --global user.email "your-github-email@example.com"
   ```
5. Check everything works:
   ```
   node -v
   npm -v
   git --version
   ```
   You should see v24.x, a version number for npm, and a Git version.
6. Clone the repo:
   ```
   git clone https://github.com/house-manager-bd/house-manager.git
   cd house-manager
   code .
   ```
   The first push will open a browser window to sign in to GitHub. Approve it.

---

## 3. Supabase (Sifat)

### 3.1 Sign up and create the projects
1. Go to supabase.com, click **Start your project**, **Continue with GitHub**.
2. Create an organization named `House Manager`, type Personal or Educational, plan **Free**. If you already have another organization (for example a personal one), still create this new one from the organization switcher at the top left, so teammates you invite only see House Manager projects.
3. Click **New project**:
   - Name: `house-manager-dev`
   - Database password: click **Generate a password**, then save it in the password manager right away. You will rarely need it, but it cannot be shown again.
   - Region: **Southeast Asia (Singapore)**, closest to Dhaka.
   - Click **Create new project** and wait 1 to 2 minutes.
4. The free plan allows **two active projects in total, across every organization where you are Owner or Admin**. Projects you already have elsewhere count. Paused projects do not.
   - **dev**: everyone builds and tests here, data can be messy. Create it now.
   - **demo**: only for the live site and the viva, with clean sample data. If you have a free slot, create `house-manager-demo` now. If your slots are full, skip it for now: F1 deploys against dev, and before the prototype demo either pause an unused project or let a teammate create the demo project in their own account and invite you.

### 3.2 Invite the team
**Organization settings**, **Team**, **Invite**: add the four teammates with the **Developer** role. If the free plan does not offer invites when you try, share dashboard access only when needed. Teammates only need the public keys from section 7 to code.

### 3.3 Note the keys (both projects)
**Project Settings**, **API Keys**:
- **Project URL**: like `https://abcdxyz.supabase.co`. The part before `.supabase.co` is the **project ref**. Note it, Google sign-in needs it.
- **Publishable key** (starts with `sb_publishable_`, older projects call it the `anon` key): safe to use in the browser, because Row Level Security protects the data.
- **Secret key** (starts with `sb_secret_`, older name `service_role`): bypasses all security. **Never** put it in the code, in chat, or in a screenshot. F1 does not need it.

### 3.4 Auth settings (both projects)
1. **Authentication**, **URL Configuration**:
   - Site URL: `http://localhost:3000` for dev. For demo, set it to the Vercel address after F1 deploys.
   - Redirect URLs: add `http://localhost:3000/**`. After F1, also add your Vercel address with `/**` at the end.
2. **Authentication**, **Sign In / Providers**, **Email**: keep it enabled.
   - In **dev**, you can turn off **Confirm email** for the first days, so testing sign-up does not need an inbox. Turn it back on once step 6 is done.
   - In **demo**, keep **Confirm email** on.

### 3.5 Things to remember
- A free project **pauses after about 7 days without activity**. Open the dashboard before every demo and the viva. F12 adds a weekly keep-alive job.
- Free database is about 500 MB, storage about 1 GB. Plenty for the course.

---

## 4. Vercel (Sifat)

1. Go to vercel.com, **Sign Up**, choose **Hobby**, **Continue with GitHub**.
2. When asked, install the **Vercel GitHub app**. Choose the `house-manager-bd` organization and select **Only select repositories**, then `house-manager`.
3. Stop here. You will import the project during F1, when there is code to deploy.

Only you need a Vercel account. Every pull request will automatically get a preview link that the whole team can open.

---

## 5. Google sign-in (Sifat, using the project Gmail)

### 5.1 Google Cloud project
1. Sign in to console.cloud.google.com with the **project Gmail**.
2. Top bar, project picker, **New project**: name `House Manager`, no organization. Create it and select it.

### 5.2 Consent screen (Google Auth Platform)
1. Search the top bar for **Google Auth Platform** and open it. Click **Get started**.
2. **App information**: app name `House Manager`, user support email: the project Gmail.
3. **Audience**: **External**.
4. **Contact information**: the project Gmail. Agree to the policy and click **Create**.
5. **Data Access**, **Add or remove scopes**: tick `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. Save. These are basic scopes and need no Google review.
6. **Audience**, **Test users**, **Add users**: add all five team members' Gmail addresses. While the app is in **Testing** mode, only these people can sign in with Google.
7. Before the demo, go to **Audience** and click **Publish app** so anyone can sign in. Do not upload a logo yet, because a logo can trigger a brand review.

### 5.3 OAuth client
1. In Supabase, open the **dev** project, **Authentication**, **Sign In / Providers**, **Google**. Copy the **Callback URL** shown there. It looks like `https://<dev-ref>.supabase.co/auth/v1/callback`. Do the same for the **demo** project.
2. Back in Google Auth Platform, **Clients**, **Create client**:
   - Application type: **Web application**
   - Name: `House Manager Web`
   - **Authorized JavaScript origins**: `http://localhost:3000`. After F1, add your Vercel address, for example `https://house-manager.vercel.app`.
   - **Authorized redirect URIs**: paste both callback URLs (dev and demo).
   - Click **Create**.
3. Copy the **Client ID** and **Client secret** into the password manager. Download the JSON too, since Google may not show the secret again.

### 5.4 Connect to Supabase (both projects)
In each Supabase project: **Authentication**, **Sign In / Providers**, **Google**:
- Enable it, paste the Client ID and Client secret, click **Save**.

You can test it properly in F1, once there is a "Sign in with Google" button.

---

## 6. Email sending (Sifat)

### 6.1 Why this is needed
Supabase's built-in email sender is for testing only: about **2 emails per hour**, and only to members of your Supabase organization. Real users would never get their confirmation email. You need your own SMTP sender.

### 6.2 Which service
- **Resend** (free: 3,000 emails a month, 100 a day) and **Brevo** (free: 300 a day) are the better long-term options, but both expect you to verify a **domain** you own. Without a domain, sending to other people either fails or lands in spam.
- **For now, use the project Gmail's SMTP** with an app password. It is free, needs no domain, and allows a few hundred emails a day, far more than the course needs.
- When you buy a domain later, switch to Resend or Brevo. Only the SMTP settings change, no code changes.

### 6.3 Create a Gmail app password
1. Sign in to myaccount.google.com with the project Gmail.
2. **Security**, make sure **2-Step Verification** is on.
3. Search the account settings for **App passwords**. Create one named `Supabase`.
4. Google shows a 16-character password. Save it in the password manager. It works like a password for the whole mailbox, so never share it in chat.

### 6.4 Connect it to Supabase (both projects)
**Authentication**, then **Emails** (or **Settings**), **SMTP Settings**, enable **Custom SMTP**:

| Field | Value |
|---|---|
| Sender email | the project Gmail |
| Sender name | House Manager |
| Host | smtp.gmail.com |
| Port | 587 |
| Username | the project Gmail |
| Password | the 16-character app password |

Save. Then check **Authentication**, **Rate Limits**: the email limit starts at about 30 per hour, which is fine.

**Test:** **Authentication**, **Users**, **Add user**, **Send invitation** to a teammate's email. If it arrives, email works. If it lands in spam, mark it "Not spam" once. Now turn **Confirm email** back on in dev (section 3.4).

---

## 7. Secrets and the .env file

### 7.1 What is secret and what is not
| Value | Secret? | Where it lives |
|---|---|---|
| Supabase project URL | No | `.env.local`, Vercel |
| Supabase publishable key | No (safe in the browser) | `.env.local`, Vercel |
| Supabase secret key | **Yes** | Supabase dashboard only, Vercel later if a feature needs it |
| Database password | **Yes** | Password manager |
| Google client secret | **Yes** | Supabase dashboard only |
| Gmail app password | **Yes** | Supabase dashboard only |
| NID encryption key (F8) | **Yes** | Vercel env vars, never in the repo |

For F1, teammates only need the **dev** project URL and **dev** publishable key. Sifat can share those in the team group. Everything marked secret stays with Sifat and the dashboards.

### 7.2 The files (created in F1)
- `.env.example` is committed, with names but no values:
  ```
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
  ```
- `.env.local` is **never** committed. Each person copies `.env.example` to `.env.local` and fills in the dev values. The Node `.gitignore` already ignores it.
- The **demo** project's values go only into Vercel's **Environment Variables** settings.

### 7.3 If a secret leaks
If a secret key, app password or client secret ever gets committed or posted, **rotate it immediately** (create a new one, delete the old one). Deleting the commit is not enough, because a public repo's history is copied by bots within minutes.

---

## Final checklist

- [ ] Project Gmail created, 2-Step Verification on
- [ ] Old Flutter repo renamed to `house-manager-flutter`
- [ ] GitHub organization created, 4 teammates joined
- [ ] Public `house-manager` repo with README, Node .gitignore, branch ruleset
- [ ] `docs/PROJECT_PLAN.md` and `docs/SETUP.md` committed
- [ ] Everyone: Node 24, Git (with GitHub email), VS Code, repo cloned
- [ ] Supabase: `house-manager-dev` and `house-manager-demo` in Singapore, passwords saved
- [ ] Supabase: project refs, URLs and publishable keys noted
- [ ] Supabase: Site URL and redirect URLs set
- [ ] Vercel account with access to the repo
- [ ] Google: consent screen, 5 test users, web client, secret saved
- [ ] Google provider enabled in both Supabase projects
- [ ] Gmail app password created, custom SMTP set in both projects, test invite received
- [ ] Dev URL and publishable key shared with the team

When every box is ticked, start a new chat in the project with "Build F1".
