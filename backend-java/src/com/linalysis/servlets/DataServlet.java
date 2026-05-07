package com.linalysis.servlets;

import com.linalysis.auth.Auth;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * GET /api/data/summary
 * GET /api/data/connections?range=N
 * GET /api/data/ssi?range=N
 * GET /api/data/company?range=N
 *
 * All return series/summary for the authenticated user.
 */
public class DataServlet extends HttpServlet {
    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        Map<String, Object> user = Auth.current(req);
        if (user == null) { Json.error(resp, 401, "unauthorized", ""); return; }

        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        try {
            switch (path) {
                case "/api/data/summary"     -> summary(user, resp);
                case "/api/data/connections" -> series(user, req, resp, new String[]{"captured_at", "connections", "invitations"});
                case "/api/data/ssi"         -> series(user, req, resp, new String[]{"captured_at", "ssi_overall", "ssi_industry_rank", "ssi_network_rank"});
                case "/api/data/company"     -> series(user, req, resp, new String[]{
                    "captured_at", "company_followers", "company_new_followers",
                    "company_unique_visitors", "company_post_impressions",
                    "company_custom_clicks", "company_search_appearances",
                    "company_credits_available", "company_credits_total"
                });
                default -> Json.error(resp, 404, "not_found", path);
            }
        } catch (SQLException e) {
            Json.error(resp, 500, "db_error", e.getMessage());
        }
    }

    private void summary(Map<String, Object> user, HttpServletResponse resp) throws IOException, SQLException {
        Map<String, Object> latest = Db.queryOne(
            "SELECT * FROM linkedin_stats WHERE user_id = ? ORDER BY captured_at DESC LIMIT 1",
            user.get("id"));
        if (latest == null) {
            Json.ok(resp, Json.obj("empty", true, "message", "No LinkedIn data yet. Run the extension sync."));
            return;
        }
        Map<String, Object> weekAgo = Db.queryOne(
            "SELECT * FROM linkedin_stats WHERE user_id = ? AND captured_at <= DATE_SUB(CURDATE(), INTERVAL 7 DAY) " +
            "ORDER BY captured_at DESC LIMIT 1",
            user.get("id"));
        Map<String, Object> monthAgo = Db.queryOne(
            "SELECT * FROM linkedin_stats WHERE user_id = ? AND captured_at <= DATE_SUB(CURDATE(), INTERVAL 30 DAY) " +
            "ORDER BY captured_at DESC LIMIT 1",
            user.get("id"));

        JSONObject now = tidy(latest);
        Json.ok(resp, Json.obj(
            "as_of", String.valueOf(latest.get("captured_at")),
            "now", now,
            "deltas", Json.obj(
                "vs_7d",  weekAgo  == null ? JSONObject.NULL : delta(now, tidy(weekAgo)),
                "vs_30d", monthAgo == null ? JSONObject.NULL : delta(now, tidy(monthAgo))
            )
        ));
    }

    private void series(Map<String, Object> user, HttpServletRequest req, HttpServletResponse resp, String[] cols) throws IOException, SQLException {
        int range = clampInt(req.getParameter("range"), 30, 1, 3650);
        StringBuilder select = new StringBuilder("SELECT ");
        for (int i = 0; i < cols.length; i++) { if (i > 0) select.append(", "); select.append(cols[i]); }
        select.append(" FROM linkedin_stats WHERE user_id = ? AND captured_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY captured_at ASC");

        List<Map<String, Object>> rows = Db.query(select.toString(), user.get("id"), range);
        JSONArray arr = new JSONArray();
        for (Map<String, Object> r : rows) {
            JSONObject o = new JSONObject();
            for (String c : cols) {
                Object v = r.get(c);
                o.put(c, v == null ? JSONObject.NULL : "captured_at".equals(c) ? v.toString() : v);
            }
            arr.put(o);
        }
        Json.ok(resp, Json.obj("series", arr, "range_days", range));
    }

    private static int clampInt(String s, int def, int min, int max) {
        try {
            int v = s == null ? def : Integer.parseInt(s);
            return Math.max(min, Math.min(max, v));
        } catch (Exception e) { return def; }
    }

    private static JSONObject tidy(Map<String, Object> row) {
        JSONObject o = new JSONObject();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            String k = e.getKey();
            if (k.equals("id") || k.equals("user_id") || k.equals("raw_json") || k.equals("created_at")) continue;
            Object v = e.getValue();
            o.put(k, v == null ? JSONObject.NULL : "captured_at".equals(k) ? v.toString() : v);
        }
        return o;
    }

    private static JSONObject delta(JSONObject now, JSONObject then) {
        JSONObject out = new JSONObject();
        for (String k : now.keySet()) {
            Object a = now.get(k), b = then.opt(k);
            if (a instanceof Number && b instanceof Number) {
                out.put(k, ((Number) a).longValue() - ((Number) b).longValue());
            }
        }
        return out;
    }
}
