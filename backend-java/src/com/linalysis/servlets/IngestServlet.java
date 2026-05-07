package com.linalysis.servlets;

import com.linalysis.auth.Auth;
import com.linalysis.auth.RateLimit;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * POST /api/ingest/linkedin
 *
 * Chrome extension POSTs:
 * { "rows": [ { "Date": "2026-03-27", "Connections": 29355, ... } ] }
 *
 * Auth: Authorization: Bearer lnz_xxx (generated via /api/account/token)
 */
public class IngestServlet extends HttpServlet {

    private static final Map<String, String> CSV_TO_COL = new HashMap<>();
    static {
        CSV_TO_COL.put("Date",                       "captured_at");
        CSV_TO_COL.put("Connections",                "connections");
        CSV_TO_COL.put("Search Appearance",          "search_appearances");
        CSV_TO_COL.put("Search Appearances",         "search_appearances");
        CSV_TO_COL.put("Views",                      "profile_views");
        CSV_TO_COL.put("Profile Views",              "profile_views");
        CSV_TO_COL.put("Invitations",                "invitations");
        CSV_TO_COL.put("SSI Industry",               "ssi_industry_rank");
        CSV_TO_COL.put("SSI Network",                "ssi_network_rank");
        CSV_TO_COL.put("SSI",                        "ssi_overall");
        CSV_TO_COL.put("Company Followers",          "company_followers");
        CSV_TO_COL.put("Company Search Appearances", "company_search_appearances");
        CSV_TO_COL.put("Company Unique Visitors",    "company_unique_visitors");
        CSV_TO_COL.put("Company New Followers",      "company_new_followers");
        CSV_TO_COL.put("Company Post Impressions",   "company_post_impressions");
        CSV_TO_COL.put("Company Custom Clicks",      "company_custom_clicks");
        CSV_TO_COL.put("Company Credits Available",  "company_credits_available");
        CSV_TO_COL.put("Company Credits Total",      "company_credits_total");
    }

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }

        Map<String, Object> user = Auth.current(req);
        if (user == null) { Json.error(resp, 401, "unauthorized", ""); return; }

        if (!RateLimit.hit("ingest:" + user.get("id"), 100, 3600)) {
            Json.error(resp, 429, "rate_limited", "Too many ingests this hour.");
            return;
        }

        JSONObject body = Json.readBody(req);
        JSONArray rows = body.optJSONArray("rows");
        if (rows == null || rows.isEmpty()) { Json.error(resp, 422, "invalid_payload", "Expected {rows: [...]}"); return; }
        if (rows.length() > 1000)           { Json.error(resp, 413, "too_many_rows", "Max 1000 rows per request."); return; }

        int inserted = 0, updated = 0, skipped = 0;
        List<String> errors = new ArrayList<>();

        try (Connection c = Db.conn()) {
            c.setAutoCommit(false);
            try {
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject raw = rows.optJSONObject(i);
                    if (raw == null) { skipped++; errors.add("row " + i + ": not an object"); continue; }

                    Map<String, Object> mapped = new LinkedHashMap<>();
                    for (String key : raw.keySet()) {
                        String col = CSV_TO_COL.get(key);
                        if (col != null) mapped.put(col, raw.opt(key));
                    }
                    Object date = mapped.get("captured_at");
                    if (!(date instanceof String) || !isIsoDate((String) date)) { skipped++; errors.add("row " + i + ": bad Date"); continue; }

                    // Check existence for upsert count
                    boolean exists;
                    try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM linkedin_stats WHERE user_id = ? AND captured_at = ?")) {
                        ps.setObject(1, user.get("id"));
                        ps.setObject(2, date);
                        exists = ps.executeQuery().next();
                    }

                    // Build dynamic INSERT ... ON DUPLICATE KEY UPDATE
                    StringBuilder cols = new StringBuilder("user_id");
                    StringBuilder ph = new StringBuilder("?");
                    StringBuilder upd = new StringBuilder();
                    List<Object> vals = new ArrayList<>();
                    vals.add(user.get("id"));
                    boolean first = true;
                    for (Map.Entry<String, Object> e : mapped.entrySet()) {
                        cols.append(", ").append(e.getKey());
                        ph.append(", ?");
                        vals.add(e.getValue() == JSONObject.NULL ? null : e.getValue());
                        if (!e.getKey().equals("captured_at")) {
                            if (!first) upd.append(", ");
                            upd.append(e.getKey()).append(" = VALUES(").append(e.getKey()).append(")");
                            first = false;
                        }
                    }
                    String sql = "INSERT INTO linkedin_stats (" + cols + ") VALUES (" + ph + ")" +
                                 (upd.length() == 0 ? "" : " ON DUPLICATE KEY UPDATE " + upd);
                    try (PreparedStatement ps = c.prepareStatement(sql)) {
                        for (int j = 0; j < vals.size(); j++) ps.setObject(j + 1, vals.get(j));
                        ps.executeUpdate();
                    }
                    if (exists) updated++; else inserted++;
                }
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                Json.error(resp, 500, "db_error", e.getMessage());
                return;
            }
        } catch (SQLException e) {
            Json.error(resp, 500, "db_error", e.getMessage());
            return;
        }

        // Audit log (best-effort)
        try {
            Db.update(
                "INSERT INTO audit_log (user_id, action, metadata, ip_address, user_agent) VALUES (?, 'ingest', ?, ?, ?)",
                user.get("id"),
                Json.obj("inserted", inserted, "updated", updated, "skipped", skipped).toString(),
                Auth.clientIp(req),
                req.getHeader("User-Agent"));
        } catch (SQLException ignored) {}

        Json.ok(resp, Json.obj(
            "ok", true,
            "inserted", inserted,
            "updated", updated,
            "skipped", skipped,
            "errors", Json.arr(errors)
        ));
    }

    private static boolean isIsoDate(String s) {
        try { LocalDate.parse(s, DateTimeFormatter.ISO_LOCAL_DATE); return true; }
        catch (Exception e) { return false; }
    }
}
