# Linalysis backend — setup runbook

Stack: **PHP 8.2 + MySQL 8 on Hostinger**, API at `api.linalysis.net`, deployed from this repo via GitHub Actions FTP. Portable to AWS Lambda (Bref) + RDS MySQL when ready.

## Phase 1 — Hostinger (one-time, ~15 min)

### 1.1 Create the subdomain

1. hPanel → your linalysis.net hosting → **Domains → Subdomains**
2. Add subdomain: `api` → folder: `public_html/api/`
3. Wait for the folder to appear, then create `public_html/api/public/` (the web root)

### 1.2 Point the subdomain at the `public/` folder

1. hPanel → **Website → Advanced → Change Website Folder**
2. For `api.linalysis.net` set document root to `public_html/api/public/`
   *(If Hostinger's UI doesn't allow per-subdomain document root, use the `.htaccess` in `public_html/api/` — already included in this repo — which rewrites `/` → `/public/`.)*

### 1.3 Create the MySQL database

1. hPanel → **Databases → MySQL Databases**
2. Create DB: `u000000000_linalysis` (the prefix is auto-assigned)
3. Create user: `u000000000_linalysis` + strong password
4. Grant **all privileges**
5. **Save** db name, user, password — you'll need them in both `.env` and GitHub Secrets

### 1.4 Create the FTP account for auto-deploy

1. hPanel → **Files → FTP Accounts**
2. Create FTP user scoped to `/public_html/api/`
3. Save: FTP host (e.g., `ftp.linalysis.net`), username, password

### 1.5 Create the support mailbox

1. hPanel → **Emails → Email accounts**
2. Create `support@linalysis.net` + strong password
3. Note SMTP host (usually `smtp.hostinger.com`) and port 465 (SSL)

### 1.6 Set up cron jobs

1. hPanel → **Advanced → Cron Jobs**
2. Add weekly report:
   ```
   Minute: 0
   Hour: 8
   Day of month: *
   Month: *
   Day of week: 1
   Command: /usr/bin/php /home/u000000000/public_html/api/cron/weekly_report.php
   ```
3. Add monthly report:
   ```
   0 8 1 * * /usr/bin/php /home/u000000000/public_html/api/cron/monthly_report.php
   ```

## Phase 2 — Cloudflare DNS (2 min)

1. Cloudflare → linalysis.net → **DNS → Records**
2. Add record:
   - Type: **A**
   - Name: `api`
   - IPv4: Hostinger server IP (hPanel → Hosting → Details)
   - Proxy: **Proxied (orange cloud)**
3. Cloudflare → **SSL/TLS → Overview**: confirm **Full (strict)** is selected
4. Cloudflare → **SSL/TLS → Edge Certificates**: confirm **Always Use HTTPS = ON**

Wait 30–60 seconds, then verify:
```bash
curl -I https://api.linalysis.net/
# should return HTTP 200 with a JSON body once code is deployed
```

## Phase 3 — GitHub Secrets (3 min)

Repo: **gershonconsulting/linalysis** → Settings → Secrets and variables → Actions → **New repository secret** (for each):

| Secret name | Value |
|---|---|
| `HOSTINGER_FTP_SERVER` | e.g. `ftp.linalysis.net` |
| `HOSTINGER_FTP_USER`   | FTP user from 1.4 |
| `HOSTINGER_FTP_PASS`   | FTP password from 1.4 |
| `HOSTINGER_FTP_DIR`    | `/public_html/api/` *(trailing slash matters)* |

## Phase 4 — Create `.env` on Hostinger (5 min)

The workflow intentionally doesn't upload `.env` — secrets must live on the server only.

1. hPanel → **Files → File Manager** → `/public_html/api/`
2. Click **New File** → `.env`
3. Paste the contents of `.env.example` with real values filled in. Minimum required:

```
APP_ENV=production
APP_URL=https://api.linalysis.net
APP_CORS_ORIGINS=https://linalysis.net,https://www.linalysis.net,https://linalysis.pages.dev

DB_HOST=localhost
DB_PORT=3306
DB_NAME=u000000000_linalysis
DB_USER=u000000000_linalysis
DB_PASS=<strong password>

# Generate: php -r "echo bin2hex(random_bytes(32));"
JWT_SECRET=<64 hex chars>

SESSION_COOKIE_NAME=linalysis_session
SESSION_COOKIE_DOMAIN=.linalysis.net

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...    # added in Phase 6

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=ssl
SMTP_USER=support@linalysis.net
SMTP_PASS=<support mailbox pw>
SMTP_FROM_EMAIL=support@linalysis.net
SMTP_FROM_NAME=Linalysis
```

4. Save. Permissions: 600 (owner read/write only) — right-click → Permissions.

## Phase 5 — First deploy + DB migrate (2 min)

1. Push this repo to `main` → GitHub Actions runs → files land in `/public_html/api/`
2. hPanel → **Advanced → SSH Access** (or use File Manager's Terminal on Business+ plans). Run:
   ```bash
   cd ~/public_html/api
   php bin/migrate.php    # creates all tables
   php bin/seed.php       # seeds oattia@gmail.com with plan=gold
   ```
3. Smoke test:
   ```bash
   curl https://api.linalysis.net/api/health
   # → {"status":"ok","services":{"database":"ok","api":"ok"},...}
   ```

### Optional — backfill Olivier's real history

Upload the 5-year CSV you used on the frontend (`linalysis_olivier_attia_2026-04-16-*.csv`) to `/public_html/api/` via File Manager, then:
```bash
cd ~/public_html/api
php bin/import_csv.php oattia@gmail.com linalysis_olivier_attia_2026-04-16-992aa2b7.csv
rm linalysis_olivier_attia_2026-04-16-992aa2b7.csv
```

## Phase 6 — Wire Stripe webhook (3 min)

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://api.linalysis.net/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) into `.env` as `STRIPE_WEBHOOK_SECRET`
5. Test by clicking "Send test webhook" → Stripe should show 200 response, row appears in `webhook_events` table.

## Phase 7 — First login smoke test (1 min)

1. Open https://linalysis.net/login.html
2. Email: `oattia@gmail.com` · Password: `changeme` *(from seed.sql — change it immediately)*
3. On successful login, you land on `/dashboard.html` and the topbar now shows `● oattia@gmail.com · Logout`
4. Open `/troubleshooting.html` — the 6 previously-mocked checks now show real values from the API.

Then change your password:
```bash
# Via SQL:
php -r "echo password_hash('YOUR_REAL_PW', PASSWORD_BCRYPT, ['cost'=>11]);"
# → paste into UPDATE users SET password_hash='...' WHERE email='oattia@gmail.com';
```
(A proper password-change UI ships in v1.1.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| `curl https://api.linalysis.net/` returns Hostinger default page | Document root not pointing to `public/` — see 1.2, or rely on the included root-level `.htaccess` |
| 500 error, "Database connection failed" | `DB_*` values in `.env` are wrong, or DB user lacks privileges |
| 500 error, "Dependencies not installed" | GitHub Actions failed — check the workflow run; `vendor/` must be deployed |
| CORS errors in browser console | `APP_CORS_ORIGINS` in `.env` must include the exact origin (including `https://`) |
| Stripe webhook 400 "invalid_signature" | `STRIPE_WEBHOOK_SECRET` in `.env` doesn't match the one in Stripe Dashboard |
| No email delivery | Hostinger SMTP requires the sending mailbox to actually exist on that domain; check `emails/email accounts` |
| Cron didn't run | Hostinger sends cron output to the mailbox of the hosting account — check there for stderr |

## File map

```
backend/
├── public/              ← web root (serve this folder)
│   ├── index.php        ← single entry point / router
│   └── .htaccess        ← rewrites + security headers
├── src/
│   ├── Core/            ← Config, Request, Response, Router, Db, Auth, Cors, RateLimit
│   ├── Controllers/     ← Health, Auth, Account, Data, Ingest, Stripe, Report
│   └── Services/        ← Mailer, ReportBuilder
├── sql/
│   ├── schema.sql       ← CREATE TABLE for all 9 tables
│   └── seed.sql         ← admin user + free plan
├── bin/
│   ├── migrate.php      ← run schema
│   ├── seed.php         ← run seed
│   └── import_csv.php   ← one-shot historical backfill
├── cron/
│   ├── weekly_report.php
│   └── monthly_report.php
├── composer.json
├── .env.example         ← template (never commit .env)
└── SETUP.md             ← this file
```

## Migration to AWS (when ready)

1. `mysqldump u000000000_linalysis > dump.sql`
2. `mysql -h <rds-endpoint> linalysis < dump.sql`
3. Repackage PHP with Bref (`composer require bref/bref`) → deploy to Lambda via SAM
4. SES for email (replace Hostinger SMTP in `.env`)
5. EventBridge for cron (replace Hostinger cron)
6. Point Cloudflare DNS `api` record at API Gateway

Zero schema changes, zero controller rewrites.
