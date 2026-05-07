package com.linalysis.servlets;

import com.linalysis.auth.Auth;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONObject;

import java.io.IOException;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

/**
 * GET  /api/account
 * GET  /api/account/subscription
 * GET  /api/account/usage
 * POST /api/account/token
 */
public class AccountServlet extends HttpServlet {
    private static final Map<String, Map<String, Integer>> PLAN_LIMITS = new HashMap<>();
    static {
        Map<String, Integer> free     = new HashMap<>(); free.put("daily_ingests", 1); free.put("api_calls", 100);   free.put("linkedin_accounts", 1);
        Map<String, Integer> silver   = new HashMap<>(); silver.put("daily_ingests", 1); silver.put("api_calls", 500);   silver.put("linkedin_accounts", 1);
        Map<String, Integer> gold     = new HashMap<>(); gold.put("daily_ingests", 1); gold.put("api_calls", 1000);  gold.put("linkedin_accounts", 1);
        Map<String, Integer> platinum = new HashMap<>(); platinum.put("daily_ingests", 3); platinum.put("api_calls", 10000); platinum.put("linkedin_accounts", 5);
        PLAN_LIMITS.put("free", free); PLAN_LIMITS.put("silver", silver);
        PLAN_LIMITS.put("gold", gold); PLAN_LIMITS.put("platinum", platinum);
    }

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        Map<String, Object> user = Auth.current(req);
        if (user == null) { Json.error(resp, 401, "unauthorized", ""); return; }

        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        try {
            switch (path) {
                case "/api/account"              -> show(user, req, resp);
                case "/api/account/subscription" -> subscription(user, resp);
                case "/api/account/usage"        -> usage(user, resp);
                case "/api/account/token"        -> {
                    if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
                    createToken(user, req, resp);
                }
                default -> Json.error(resp, 404, "not_found", path);
            }
        } catch (SQLException e) {
            Json.error(resp, 500, "db_error", e.getMessage());
        }
    }

    private void show(Map<String, Object> user, HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        // Session expiry — only if called via cookie
        Object sessionInfo = JSONObject.NULL;
        String token = Auth.sessionTokenFromRequest(req);
        if (token != null) {
            Map<String, Object> sess = Db.queryOne(
                "SELECT expires_at FROM sessions WHERE id = ?",
                com.linalysis.util.Password.sha256Hex(token));
            if (sess != null) {
                long daysLeft = Math.max(0, (((java.sql.Timestamp) sess.get("expires_at")).getTime() - System.currentTimeMillis()) / 86400000);
                sessionInfo = Json.obj("expires_at", sess.get("expires_at").toString(), "days_left", daysLeft);
            }
        }
        Json.ok(resp, Json.obj(
            "user", Json.obj(
                "id",             user.get("id"),
                "email",          user.get("email"),
                "full_name",      user.get("full_name"),
                "timezone",       user.get("timezone"),
                "email_verified", user.get("email_verified_at") != null
            ),
            "session", sessionInfo
        ));
    }

    private void subscription(Map<String, Object> user, HttpServletResponse resp) throws IOException, SQLException {
        Map<String, Object> sub = Db.queryOne(
            "SELECT plan, status, amount_cents, currency, current_period_end, cancel_at_period_end " +
            "FROM subscriptions WHERE user_id = ?", user.get("id"));
        if (sub == null) { Json.ok(resp, Json.obj("plan", "free", "status", "active")); return; }
        Json.ok(resp, Json.from(sub));
    }

    private void usage(Map<String, Object> user, HttpServletResponse resp) throws IOException, SQLException {
        long total = ((Number) Db.queryOne("SELECT COUNT(*) AS n FROM linkedin_stats WHERE user_id = ?", user.get("id")).get("n")).longValue();
        long thisMonth = ((Number) Db.queryOne(
            "SELECT COUNT(*) AS n FROM linkedin_stats WHERE user_id = ? AND captured_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            user.get("id")).get("n")).longValue();
        Map<String, Object> last = Db.queryOne(
            "SELECT MAX(captured_at) AS d FROM linkedin_stats WHERE user_id = ?", user.get("id"));
        Map<String, Object> sub = Db.queryOne("SELECT plan FROM subscriptions WHERE user_id = ?", user.get("id"));
        String plan = sub == null ? "free" : (String) sub.get("plan");

        Json.ok(resp, Json.obj(
            "plan", plan,
            "limits", Json.from((Map) new HashMap<>(PLAN_LIMITS.getOrDefault(plan, PLAN_LIMITS.get("free")))),
            "stats_days_total", total,
            "stats_this_month", thisMonth,
            "last_ingest", last == null || last.get("d") == null ? JSONObject.NULL : last.get("d").toString()
        ));
    }

    private void createToken(Map<String, Object> user, HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        JSONObject body = Json.readBody(req);
        String name = body.optString("name", "Chrome extension");
        if (name.length() > 100) name = name.substring(0, 100);
        String token = Auth.issueApiToken(((Number) user.get("id")).intValue(), name);
        Json.created(resp, Json.obj(
            "token", token,
            "name", name,
            "warning", "This is the only time you will see this token. Copy it now."
        ));
    }
}
