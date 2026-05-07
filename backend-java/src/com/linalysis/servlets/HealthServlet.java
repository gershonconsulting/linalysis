package com.linalysis.servlets;

import com.linalysis.Config;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.time.Instant;

/**
 * GET /api/health   — smoke test for dev
 * GET /api/version  — shows build timestamp
 * GET /             — API root
 */
public class HealthServlet extends HttpServlet {
    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        switch (path) {
            case "/api/health" -> Json.ok(resp, Json.obj(
                "status", Db.ping() ? "ok" : "degraded",
                "services", Json.obj("database", Db.ping() ? "ok" : "fail", "api", "ok"),
                "time", Instant.now().toString(),
                "version", Config.get("app.build", "dev")
            ));
            case "/api/version" -> Json.ok(resp, Json.obj(
                "version", Config.get("app.build", "dev"),
                "java", System.getProperty("java.version")
            ));
            default -> Json.ok(resp, Json.obj(
                "name", Config.get("app.name", "Linalysis API"),
                "status", "ok"
            ));
        }
    }
}
