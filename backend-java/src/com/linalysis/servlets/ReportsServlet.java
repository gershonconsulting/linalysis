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
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;

/**
 * GET /api/reports/list  — recent deliveries + last sent
 * GET /api/reports/next  — next scheduled delivery
 */
public class ReportsServlet extends HttpServlet {
    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        Map<String, Object> user = Auth.current(req);
        if (user == null) { Json.error(resp, 401, "unauthorized", ""); return; }

        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        try {
            switch (path) {
                case "/api/reports/list" -> list(user, resp);
                case "/api/reports/next" -> next(user, resp);
                default -> Json.error(resp, 404, "not_found", path);
            }
        } catch (SQLException e) {
            Json.error(resp, 500, "db_error", e.getMessage());
        }
    }

    private void list(Map<String, Object> user, HttpServletResponse resp) throws IOException, SQLException {
        List<Map<String, Object>> rows = Db.query(
            "SELECT report_type, period_start, period_end, scheduled_for, sent_at, opened_at, status, subject " +
            "FROM report_deliveries WHERE user_id = ? ORDER BY scheduled_for DESC LIMIT 20",
            user.get("id"));
        Map<String, Object> last = Db.queryOne(
            "SELECT sent_at, report_type FROM report_deliveries " +
            "WHERE user_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1",
            user.get("id"));

        JSONArray arr = new JSONArray();
        for (Map<String, Object> r : rows) arr.put(Json.from(r));
        Json.ok(resp, Json.obj(
            "deliveries", arr,
            "last_sent",  last == null ? JSONObject.NULL : Json.from(last)
        ));
    }

    private void next(Map<String, Object> user, HttpServletResponse resp) throws IOException, SQLException {
        Map<String, Object> row = Db.queryOne(
            "SELECT report_type, scheduled_for FROM report_deliveries " +
            "WHERE user_id = ? AND status = 'pending' AND scheduled_for > UTC_TIMESTAMP() " +
            "ORDER BY scheduled_for ASC LIMIT 1",
            user.get("id"));
        if (row != null) { Json.ok(resp, Json.from(row)); return; }

        // Compute next Monday 08:00 (same logic as Worker)
        LocalDateTime nextMonday = LocalDateTime.now()
            .with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY))
            .withHour(8).withMinute(0).withSecond(0).withNano(0);
        Json.ok(resp, Json.obj(
            "report_type", "weekly",
            "scheduled_for", nextMonday.toString(),
            "computed", true
        ));
    }
}
