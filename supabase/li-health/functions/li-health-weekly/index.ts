// Task [11] LinkedIn account health check (weekly)
// Supabase edge function: li-health-weekly  (project zywlzopoxhkbblembkja)
//
// Called by pg_cron (Monday 15:00 UTC) via pg_net with header x-cron-secret.
//   POST /li-health-weekly                -> compute, write li_health_checks + li_health_incidents,
//                                            email only if anything is Degraded/Restricted/Check failed
//   POST /li-health-weekly?dry_run=1      -> compute and return JSON only (no writes, no email)
//   POST /li-health-weekly?force_email=1  -> email even when everything is OK (go-live test)
//
// Rules (same as the Claude task it replaces):
//   Restricted : gate status 'restricted' or restricted_until in the future
//   Degraded   : status 'paused', or denies_7d > 0, or v24 >= 80% daily_cap, or v7d >= 80% weekly_cap
//   OK         : otherwise
//   Zero ledger rows = "no telemetry" (never shown as 0). '-template' accounts are skipped (in SQL).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("LI_HEALTH_CRON_SECRET") ?? "";
const MAIL_TO = Deno.env.get("LI_HEALTH_TO") ?? "report@gershonconsulting.com";
const MAIL_FROM = "LinkedIn Health <alerts@gershon.ai>";

type Health = "OK" | "Degraded" | "Restricted" | "Check failed";

interface Snap {
  account_key: string; label: string | null; gate_status: string;
  restricted_until: string | null; daily_cap: number; weekly_cap: number; hourly_cap: number;
  notes: string | null; updated_at: string;
  ledger_rows: number; last_ledger_ts: string | null;
  v24: number | null; v7d: number | null; denies_7d: number | null;
}

interface Result extends Snap { health: Health; reasons: string[]; telemetry: boolean }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function pg(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

function classify(s: Snap, now: Date): Result {
  const reasons: string[] = [];
  const telemetry = Number(s.ledger_rows) > 0;
  const restrictedUntil = s.restricted_until ? new Date(s.restricted_until) : null;

  if (s.gate_status === "restricted") reasons.push("gate status restricted");
  if (restrictedUntil && restrictedUntil > now) reasons.push(`restricted until ${restrictedUntil.toISOString()}`);
  if (reasons.length) return { ...s, health: "Restricted", reasons, telemetry };

  if (s.gate_status === "paused") reasons.push("paused in gate");
  if (telemetry) {
    const d = Number(s.denies_7d ?? 0), v24 = Number(s.v24 ?? 0), v7 = Number(s.v7d ?? 0);
    if (d > 0) reasons.push(`${d} denies in 7d`);
    if (s.daily_cap > 0 && v24 >= 0.8 * s.daily_cap) reasons.push(`24h ${v24}/${s.daily_cap} (${Math.round(100 * v24 / s.daily_cap)}% of daily cap)`);
    if (s.weekly_cap > 0 && v7 >= 0.8 * s.weekly_cap) reasons.push(`7d ${v7}/${s.weekly_cap} (${Math.round(100 * v7 / s.weekly_cap)}% of weekly cap)`);
  }
  return { ...s, health: reasons.length ? "Degraded" : "OK", reasons, telemetry };
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const COLOR: Record<Health, string> = { OK: "#1a7f37", Degraded: "#b26b00", Restricted: "#c62828", "Check failed": "#c62828" };

function summaryOf(results: Result[], failed: string | null): string {
  if (failed) return "Check failed";
  const r = results.filter((x) => x.health === "Restricted").length;
  const d = results.filter((x) => x.health === "Degraded").length;
  const ok = results.filter((x) => x.health === "OK").length;
  if (!r && !d) return `All ${ok} OK`;
  return [r && `${r} Restricted`, d && `${d} Degraded`, `${ok} OK`].filter(Boolean).join(", ");
}

function renderHtml(results: Result[], failed: string | null, summary: string, date: string): string {
  if (failed) {
    return `<div style="font-family:Arial,sans-serif;font-size:14px"><h2 style="color:#c62828">[11] LinkedIn health check failed - ${esc(date)}</h2>` +
      `<p>The weekly check could not read the gate tables.</p><pre style="background:#f6f6f6;padding:8px">${esc(failed)}</pre></div>`;
  }
  const order: Record<Health, number> = { Restricted: 0, "Check failed": 0, Degraded: 1, OK: 2 };
  const rows = [...results].sort((a, b) => order[a.health] - order[b.health] || a.account_key.localeCompare(b.account_key)).map((r) => {
    const vol = r.telemetry
      ? `${r.v24}/${r.daily_cap} &middot; ${r.v7d}/${r.weekly_cap} &middot; ${r.denies_7d}`
      : `<i>no telemetry</i>`;
    return `<tr><td style="padding:4px 8px"><b style="color:${COLOR[r.health]}">${r.health}</b></td>` +
      `<td style="padding:4px 8px">${esc(r.label ?? r.account_key)}<br><span style="color:#888;font-size:12px">${esc(r.account_key)}</span></td>` +
      `<td style="padding:4px 8px">${esc(r.gate_status)}</td><td style="padding:4px 8px">${vol}</td>` +
      `<td style="padding:4px 8px">${r.last_ledger_ts ? esc(r.last_ledger_ts.slice(0, 16).replace("T", " ")) : "-"}</td>` +
      `<td style="padding:4px 8px">${esc(r.reasons.join("; ") || "-")}</td></tr>`;
  }).join("");
  return `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    `<h2 style="margin:0 0 8px">[11] LinkedIn health - ${esc(summary)} - ${esc(date)}</h2>` +
    `<p style="color:#555">Source: LinkedIn Access Gate (li_gate_accounts / li_gate_ledger). Volumes = allowed units; denies = gate refusals.</p>` +
    `<table style="border-collapse:collapse;font-size:13px" border="1" cellspacing="0">` +
    `<tr style="background:#f2f2f2"><th>Health</th><th>Account</th><th>Gate</th><th>24h/day cap &middot; 7d/week cap &middot; denies 7d</th><th>Last activity (UTC)</th><th>Why</th></tr>` +
    rows + `</table></div>`;
}

async function sendEmail(subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [MAIL_TO], subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body)}`);
  return body as { id?: string };
}

async function syncIncidents(runId: string, items: Array<{ account_key: string; health: Health; reasons: string[] }>, now: string) {
  const open = await pg(`li_health_incidents?closed_at=is.null&select=id,account_key,health,weeks_open`) as
    Array<{ id: number; account_key: string; health: Health; weeks_open: number }>;
  const byKey = new Map(open.map((o) => [o.account_key, o]));
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.account_key);
    const cur = byKey.get(it.account_key);
    if (it.health === "OK") {
      if (cur) await pg(`li_health_incidents?id=eq.${cur.id}`, { method: "PATCH", body: JSON.stringify({ closed_at: now }) });
      continue;
    }
    if (cur && cur.health === it.health) {
      await pg(`li_health_incidents?id=eq.${cur.id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_seen_at: now, last_run_id: runId, reasons: it.reasons, weeks_open: cur.weeks_open + 1 }),
      });
      continue;
    }
    if (cur) await pg(`li_health_incidents?id=eq.${cur.id}`, { method: "PATCH", body: JSON.stringify({ closed_at: now }) });
    await pg(`li_health_incidents`, {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ account_key: it.account_key, health: it.health, reasons: it.reasons, opened_at: now, last_seen_at: now, first_run_id: runId, last_run_id: runId }),
    });
  }
  // accounts that vanished from the gate (deleted / renamed to -template): close their incidents
  for (const o of open) {
    if (!seen.has(o.account_key)) {
      await pg(`li_health_incidents?id=eq.${o.id}`, { method: "PATCH", body: JSON.stringify({ closed_at: now }) });
    }
  }
}

Deno.serve(async (req: Request) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const forceEmail = url.searchParams.get("force_email") === "1";

  const now = new Date();
  const nowIso = now.toISOString();
  const date = nowIso.slice(0, 10);
  const runId = crypto.randomUUID();

  let results: Result[] = [];
  let failed: string | null = null;
  try {
    const snap = await pg("rpc/li_health_snapshot", { method: "POST", body: "{}" }) as Snap[];
    results = snap.map((s) => classify(s, now));
  } catch (err) {
    failed = String(err);
  }

  const summary = summaryOf(results, failed);
  const subject = `[11] LinkedIn health — ${summary} — ${date}`;
  const needsEmail = forceEmail || !!failed || results.some((r) => r.health !== "OK");

  const out: Record<string, unknown> = {
    ok: !failed, run_id: runId, dry_run: dryRun, summary, subject, would_email: needsEmail,
    accounts: results.map((r) => ({
      account_key: r.account_key, label: r.label, health: r.health, reasons: r.reasons, gate_status: r.gate_status,
      telemetry: r.telemetry ? "yes" : "no telemetry",
      v24: r.telemetry ? r.v24 : "no telemetry", v7d: r.telemetry ? r.v7d : "no telemetry",
      denies_7d: r.telemetry ? r.denies_7d : "no telemetry", daily_cap: r.daily_cap, weekly_cap: r.weekly_cap,
      last_ledger_ts: r.last_ledger_ts,
    })),
    error: failed,
  };
  if (dryRun) return json(out);

  const errors: string[] = [];
  try {
    const rows = failed
      ? [{ run_id: runId, checked_at: nowIso, account_key: "__run__", health: "Check failed", reasons: ["snapshot query failed"], error: failed }]
      : results.map((r) => ({
        run_id: runId, checked_at: nowIso, account_key: r.account_key, label: r.label, health: r.health,
        reasons: r.reasons, gate_status: r.gate_status, restricted_until: r.restricted_until,
        daily_cap: r.daily_cap, weekly_cap: r.weekly_cap, telemetry: r.telemetry,
        ledger_rows: r.ledger_rows, last_ledger_ts: r.last_ledger_ts,
        v24: r.telemetry ? r.v24 : null, v7d: r.telemetry ? r.v7d : null, denies_7d: r.telemetry ? r.denies_7d : null,
      }));
    await pg("li_health_checks", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
    // On failure only the run-level incident is touched; per-account incidents stay as they were.
    if (failed) {
      await syncIncidents(runId, [{ account_key: "__run__", health: "Check failed", reasons: [failed.slice(0, 300)] }], nowIso)
        .catch(() => {});
    } else {
      await syncIncidents(runId, [
        ...results.map((r) => ({ account_key: r.account_key, health: r.health, reasons: r.reasons })),
        { account_key: "__run__", health: "OK" as Health, reasons: [] },
      ], nowIso);
    }
  } catch (err) {
    errors.push(`write: ${String(err)}`);
  }

  if (needsEmail) {
    try {
      const sent = await sendEmail(subject, renderHtml(results, failed, summary, date));
      out.email_id = sent.id ?? null;
    } catch (err) {
      errors.push(`email: ${String(err)}`);
    }
  }
  out.errors = errors;
  return json(out, errors.length || failed ? 500 : 200);
});
