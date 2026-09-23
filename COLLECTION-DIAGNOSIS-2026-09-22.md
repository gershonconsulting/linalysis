# Why the collection report is uneven — diagnosis of 2026-09-22

Read with [[linalysis-collection-rootcauses-0930]]. Everything below was verified against live
data on 2026-09-22: the stored audit record, every account's latest stats row, the extension
diagnostics in KV, and a live check of `/sales/ssi` in the collecting browser.

**The short version: this is not one bug. It is six, and three of them are on the SERVER — which
is why "some accounts are complete and some are not" has never resolved. The accounts differ by
language, by plan and by which machine collects; the server bugs hit everyone equally and have
never been deployed away.**

---

## 1. InMail Credits + Premium Plan — fails for 5 of 5 accounts, every day  ❌ server

Not a selector. Two independent causes stacked:

- **The deployed Worker has no `CSV_TO_COL` mapping for `InMail Credits`, `Premium Plan` or
  `Premium Renews`.** Proof: not one of the five active accounts has any of those three fields in
  any stored row — `premium_plan`, `inmail_credits`, `premium_renews` are absent for everybody. The
  extension captured them; ingest discarded them on arrival. The LOCAL worker already has the
  mapping; production does not.
- **LinkedIn's redesigned Premium hub prints no credit balance at all.** Proof: the full page text
  from a live French capture (`zeitount@`, Sales Navigator Core) contains no credit figure
  anywhere. The plan and the renewal date are there in plain text — "Détails de l'abonnement /
  Sales Navigator Core / Renouvelé le 1 octobre 2026" — the balance is not.

Fixed in v0.3.1 by reporting the balance as NOT PUBLISHED rather than as a failed page, and by
reading the French renewal wording, which none of the three old prefixes matched.

## 2. Invitations — partial for 4 of 5  ❌ extension

amoslee (Pages), david (sent 24h), vincent (1 field), zeitount (2 fields). Every receipt shows the
page rendered (1,330–1,638 chars) with no error. Two causes:

- **Zero was reported as a failure.** LinkedIn renders the Pages tab with no "(n)" when none are
  pending, and an empty sent list has no rows.
- **The tab labels are translated.** zeitount (French) has never once returned a pending count
  while returning sent counts every day — an asymmetry that can only be a label problem.

v0.3.1 writes 0 on an explicit empty state, and reads the tab count by its **href** rather than its
translated label.

## 3. The German account — SSI industry rank, search appearances, company followers/visitors  ❌ extension

`david.liese12@` is `lang=de`. Every field he loses is one matched by a printed label; every field
he keeps is one matched structurally. The German label arrays have always been guesses — none was
ever validated against his real page.

v0.3.1 stops guessing. LinkedIn translates what it PRINTS but not its MARKUP: the ids, test hooks
and class tokens are English in every locale. A new attribute-anchored reader runs as a last resort
behind the existing ones, so English accounts are untouched and German ones get a route that does
not care about language. Ambiguity still returns nothing — a wrong number stays worse than a
missing one.

## 4. olivier@attia.com SSI — NOT a selector. Sales Navigator is signed out.  ⚠ needs a human

Verified live on 2026-09-22: `https://www.linkedin.com/sales/ssi` redirects to
`/sales/login`, and `/premium/my-premium/` redirects to `/uas/login`. The 211-character receipt is
the app shell. The premium receipt already said `/checkpoint/lg/floe-profile`.

**No code change can fix this.** Someone has to sign in to LinkedIn and Sales Navigator in the
Chrome profile that runs the extension on that computer.

## 5. The report blamed the wrong layer, by construction  ❌ extension

`content-ssi.js` fires itself 5 seconds after load, independently of the sync. On a signed-out
machine the orchestrator filed an accurate "did not render" receipt and `postSSI` then OVERWROTE it
— same page key, last write wins — with "the SSI page did not show the four sub-scores". Every
render and sign-in failure was being relabelled as a moved selector before anyone read the report.
v0.3.1 makes a fact beat a guess and stops the overwrite.

## 6. Failures left no evidence  ❌ server

- The Worker dropped `body.sample` on write, so not one failing page in the whole report carries the
  page sample the extension has been shipping since v0.2.7.
- Diagnostics were keyed `diag:{email}:{date}` — ONE slot per user per day. On a day when six pages
  reported, five were silently overwritten by the sixth. Every investigation opened a diagnostic
  belonging to a different page. Now keyed by page.

## 7. The headline over-alarms  ❌ server

`cohana@`, `kayquespimentel1@`, `onelastthoughtpod@` have never checked in an extension — they were
never set up. Counting them as failures made the alarm louder every time an account was added while
nothing had got worse. They now report as NOT SET UP and are out of the denominator.

---

## The meta-blocker: nobody is running the fixes

All five active accounts report **v0.2.9**. v0.3.0 was built on 2026-09-11 and never published.
Worse, these installs were loaded with **Load unpacked**, and Chrome ignores `update_url` for those
— publishing a new CRX changes nothing for an existing user. Until each user reinstalls, no
extension fix reaches anyone.

The three SERVER fixes (1, 6, 7) need no user action at all. They are the half worth shipping first.
