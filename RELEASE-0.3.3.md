# Linalysis release 0.3.3 — staging branch ❌ NOT DEPLOYED

This branch holds the 0.3.0 → 0.3.3 work that was built on Olivier's machine (2026-09-11 → 09-23)
and never reached GitHub. Only `main` deploys (see `.github/workflows/deploy.yml`), so nothing
here is live. Handoff for the deploy: `DEPLOY-0.3.3-for-Charles.md`.

Contents:
- `linalysis-extension/` — extension source at 0.3.3
- `worker/src/index.mjs` — local Worker source (⚠ NOT a superset of production: production has the
  monthly-report + purge features this file lacks. Never deploy it wholesale — use the patch script.)
- `deploy/charles-worker-deploy-2026-09-23.js` — one-paste, in-place patch of the LIVE Worker
- `WORKER-PATCH-*.{md,diff}` — the individual server patches it bundles
- `COLLECTION-DIAGNOSIS-2026-09-22.md` — evidence trail

Signed binaries (`extension/linalysis.crx`, `linalysis-extension-0.3.3.zip`) could not be pushed from
the cloud session; they are in Olivier's local Linalysis folder.
