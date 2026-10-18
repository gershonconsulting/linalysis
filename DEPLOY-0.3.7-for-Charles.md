# Linalysis extension 0.3.7: merge PR #3 (one click)

**What:** German/French collection fixes for David and zeitount, and "SSI discontinued" detection (Vincent).
**PR:** https://github.com/gershonconsulting/linalysis/pull/3 (base `main`). It holds the extension files only. The Credits page and the Worker stay in PR #2.

## Steps
1. Open the PR → **Merge pull request** → **Confirm merge**.
2. Wait about 1 minute (GitHub Actions deploys to Cloudflare Pages).
3. Check https://linalysis.net/extension/updates.xml. It should show `version="0.3.7"`.
4. Check that https://linalysis.net/linalysis-extension.zip downloads, and that its manifest says 0.3.7.

## After the merge
Installs use **Load unpacked**, and Chrome never auto-updates those. Each collecting computer (David first, then zeitount and the others) has to replace the extension folder with the new zip, then click **Reload** on chrome://extensions.

## What's NOT in this PR
The Worker 0.3.6 patch (DEPLOY-0.3.6-for-Charles.md) is still pending. It fixes the history of DE/FR SSI ranks and adds the Credits columns.
