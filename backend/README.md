# Linalysis backend

PHP 8.2 + MySQL 8 API for linalysis.net. Hosted on Hostinger today, portable to AWS Lambda (Bref) + RDS tomorrow.

**Live:** https://api.linalysis.net
**Setup:** see [SETUP.md](SETUP.md)
**Health:** `GET /api/health`

## Endpoints

| Method | Path                          | Auth    | Purpose |
|--------|-------------------------------|---------|---------|
| GET    | `/api/health`                 | none    | DB ping + uptime |
| GET    | `/api/version`                | none    | Build stamp |
| POST   | `/api/auth/signup`            | none    | Create account |
| POST   | `/api/auth/login`             | none    | Sign in → sets session cookie |
| POST   | `/api/auth/logout`            | cookie  | Revoke session |
| GET    | `/api/auth/me`                | cookie  | Current user |
| POST   | `/api/auth/forgot`            | none    | Send reset email |
| POST   | `/api/auth/reset`             | token   | Consume reset link |
| GET    | `/api/account`                | cookie  | User + session info |
| GET    | `/api/account/subscription`   | cookie  | Stripe plan state |
| GET    | `/api/account/usage`          | cookie  | Days ingested vs plan limits |
| POST   | `/api/account/token`          | cookie  | Issue Bearer token for extension |
| GET    | `/api/data/summary`           | cookie  | Latest + 7d/30d deltas |
| GET    | `/api/data/connections?range` | cookie  | Connections + invitations time series |
| GET    | `/api/data/ssi?range`         | cookie  | SSI overall + industry/network ranks |
| GET    | `/api/data/company?range`     | cookie  | All company_* fields |
| POST   | `/api/ingest/linkedin`        | bearer  | Chrome extension posts rows |
| POST   | `/api/stripe/webhook`         | sig     | Stripe subscription events |
| GET    | `/api/reports/list`           | cookie  | Recent deliveries |
| GET    | `/api/reports/next`           | cookie  | Next scheduled report |

## Local development

```bash
cd backend
composer install
cp .env.example .env       # fill in DB_* etc.
php bin/migrate.php
php bin/seed.php
composer serve             # → http://127.0.0.1:8787
```

## Architecture

```
Browser (linalysis.net)  ──session cookie─→  api.linalysis.net/api/*
                                                     ↓
Chrome extension         ──Bearer token──→   api.linalysis.net/api/ingest/*
                                                     ↓
                                              Hostinger MySQL
                                                     ↑
Hostinger cron  ──weekly/monthly──→  cron/*.php  ──SMTP──→  inbox
                                                     ↑
Stripe  ──webhook──→  /api/stripe/webhook
```
