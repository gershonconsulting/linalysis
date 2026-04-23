# Linalysis

LinkedIn analytics dashboard — [linalysis.net](https://linalysis.net)

Track connections, profile views, SSI, and company page performance over years — not weeks. Weekly + monthly reports, AI insights, and a Chrome extension that collects data automatically.

## What's in this repo

Static site that powers `linalysis.net`:

| File | Purpose |
|---|---|
| `index.html` | Public landing page |
| `dashboard.html` | Analytics dashboard with real KPIs |
| `summary.html` | Expanded 12-metric view with AI insights |
| `company.html` | Gershon Consulting company page analytics |
| `campaigns.html` | LinkedIn outreach campaigns (Streak CRM data) |
| `messaging.html`, `emailing.html` | Outreach channel analytics |
| `my-data.html`, `import-export.html` | Data table + CSV/JSON import/export |
| `reports.html` | Weekly + monthly email-report previews |
| `troubleshooting.html` | 26-check diagnostic tool |
| `guests.html` | Profile viewers + pending invitations |
| `account.html`, `pricing.html` | Account + Stripe Pricing Table |
| `terms.html`, `privacy.html`, `cookies.html` | Legal pages |
| `common.css` | Shared styles (brand color `#FE1B04`) |
| `nav.js` | Sidebar nav injection + build stamp |
| `data.js` | Embedded 5-year LinkedIn history (Olivier Attia, anonymized) |

## Deploy

Hosted on **Cloudflare Pages** (project `linalysis`). Deploys happen via direct upload from the Linalysis workspace using the Cloudflare Pages API.

- Domain: [linalysis.net](https://linalysis.net)
- CDN: Cloudflare (Google Trust Services cert)
- Build: static, no build step

## Legacy

The previous Streamlit app version has been archived — it's still reachable at [linalysis.streamlit.app](https://linalysis.streamlit.app) as a legacy surface. The pre-Apr-2026 commit history of this repo contains that Streamlit code if needed.

## License

© 2026 Gershon Consulting. All rights reserved.
