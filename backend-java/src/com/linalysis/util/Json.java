package com.linalysis.util;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import java.util.Map;

/**
 * Uses org.json (WEB-INF/lib/json-*.jar). ~75 KB JAR, zero transitive deps.
 *
 * Write:  Json.ok(resp, Json.obj("count", 3, "ok", true));
 * Read :  JSONObject body = Json.readBody(req);
 */
public final class Json {
    private Json() {}

    /* ──────────────────── Builders ──────────────────── */

    public static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1] == null ? JSONObject.NULL : kv[i + 1]);
        return o;
    }

    public static JSONArray arr(List<?> items) {
        JSONArray a = new JSONArray();
        for (Object it : items) a.put(it);
        return a;
    }

    public static JSONObject from(Map<String, Object> row) {
        JSONObject o = new JSONObject();
        if (row != null) for (Map.Entry<String, Object> e : row.entrySet()) {
            o.put(e.getKey(), e.getValue() == null ? JSONObject.NULL : e.getValue());
        }
        return o;
    }

    /* ──────────────────── Response helpers ──────────────────── */

    public static void send(HttpServletResponse resp, int status, Object body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json; charset=utf-8");
        PrintWriter w = resp.getWriter();
        w.write(body == null ? "null" : body.toString());
        w.flush();
    }

    public static void ok(HttpServletResponse resp, Object body) throws IOException {
        send(resp, 200, body);
    }

    public static void created(HttpServletResponse resp, Object body) throws IOException {
        send(resp, 201, body);
    }

    public static void error(HttpServletResponse resp, int status, String code, String message) throws IOException {
        send(resp, status, obj("error", code, "message", message == null ? "" : message));
    }

    /* ──────────────────── Parse request body ──────────────────── */

    public static JSONObject readBody(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = req.getReader()) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
        }
        String body = sb.toString().trim();
        if (body.isEmpty()) return new JSONObject();
        try {
            Object parsed = new JSONTokener(body).nextValue();
            return parsed instanceof JSONObject ? (JSONObject) parsed : new JSONObject();
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    public static String str(JSONObject o, String key) {
        return o.has(key) && !o.isNull(key) ? o.getString(key).trim() : "";
    }
}
