# Linalysis release 0.3.3 — staging branch ❌ NOT DEPLOYED

This branch holds the 0.3.0 → 0.3.3 work that was built on Olivier's machine (2026-09-11 → 09-23)
and never reached GitHub. Only `main` deploys (see `.github/workflows/deploy.yml`), so nothing
here is live. Handoff for the deploy: `DEPLOY-0.3.3-for-Charles.md`.

On this branch:
- `linalysis-extension/` — extension source at 0.3.3 (manifest, background.js, content-metrics.js,
  content-ssi.js). Pushed through the GitHub connector: a few characters are written in an
  equivalent form (e.g. `—` instead of `—`), so byte hashes differ from the signed build while
  behaviour is identical. The signed build was packed from Olivier's local copy.
- `extension/updates.xml` (0.3.3), `nav.js` (latest extension 0.3.3)
- `deploy/charles-worker-deploy-2026-09-23-safe.js` — one-paste, in-place patch of the LIVE Worker;
  every anchor verified against production
- `WORKER-PATCH-2026-09-11.md`, `WORKER-PATCH-2026-09-23-connection-cap.diff` — the patches it applies
- `COLLECTION-DIAGNOSIS-2026-09-22.md`, `DEPLOY-0.3.2-for-Charles.md` — background

NOT on this branch (only in Olivier's local Linalysis folder, and in the claude.ai Linalysis project):
- the signed `extension/linalysis.crx` and `linalysis-extension-0.3.3.zip` — the GitHub connector
  cannot carry binary files and direct git push is not authorised for this repo from the cloud session
- `WORKER-PATCH-2026-09-22*.diff` and the full 32-edit deploy script — written against the LOCAL
  Worker copy, which differs from production (prod has monthly reports + purge the local copy lacks;
  the local copy has label pack, data guard, company ID and disconnection alerts prod lacks). They
  must be re-based on the live script before use.
- `worker/src/index.mjs` local copy — never deploy it wholesale, for the same reason.
