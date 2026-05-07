package com.linalysis.servlets;

import com.linalysis.auth.Auth;
import com.linalysis.auth.RateLimit;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import com.linalysis.util.Password;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONObject;

import java.io.IOException;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Handles all /api/auth/* endpoints. Dispatches on sub-path.
 *
 * POST /api/auth/signup
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 * POST /api/auth/forgot      (stores token; actual email send is a separate concern)
 * POST /api/auth/reset
 */
public class AuthServlet extends HttpServlet {
    private static final Pattern EMAIL_RE = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        try {
            switch (path) {
                case "/api/auth/signup" -> signup(req, resp);
                case "/api/auth/login"  -> login(req, resp);
                case "/api/auth/logout" -> logout(req, resp);
                case "/api/auth/me"     -> me(req, resp);
                case "/api/auth/forgot" -> forgot(req, resp);
                case "/api/auth/reset"  -> reset(req, resp);
                default                 -> Json.error(resp, 404, "not_found", path);
            }
        } catch (SQLException e) {
            log("SQL error", e);
            Json.error(resp, 500, "db_error", e.getMessage());
        }
    }

    /* ───────── signup ───────── */
    private void signup(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
        JSONObject body = Json.readBody(req);
        String email    = Json.str(body, "email").toLowerCase();
        String password = body.optString("password", "");
        String fullName = Json.str(body, "full_name");

        if (!EMAIL_RE.matcher(email).matches()) { Json.error(resp, 422, "invalid_email", "Enter a valid email."); return; }
        if (password.length() < 10)              { Json.error(resp, 422, "weak_password", "Password must be at least 10 characters."); return; }
        if (!RateLimit.hit("signup:" + Auth.clientIp(req), 5, 300)) { Json.error(resp, 429, "rate_limited", ""); return; }

        Map<String, Object> existing = Db.queryOne("SELECT id FROM users WHERE email = ?", email);
        if (existing != null) { Json.error(resp, 409, "email_taken", "An account with this email already exists."); return; }

        long userId = Db.insert(
            "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
            email, Password.hash(password), fullName.isEmpty() ? null : fullName);
        Db.update(
            "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, 'free', 'active')",
            userId);

        Auth.issueSession((int) userId, req, resp);
        Json.created(resp, Json.obj("ok", true, "user", Json.obj("id", userId, "email", email)));
    }

    /* ───────── login ───────── */
    private void login(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
        JSONObject body = Json.readBody(req);
        String email    = Json.str(body, "email").toLowerCase();
        String password = body.optString("password", "");

        if (!RateLimit.hit("login:" + Auth.clientIp(req), 10, 60)) { Json.error(resp, 429, "rate_limited", ""); return; }

        Map<String, Object> user = Db.queryOne("SELECT id, password_hash FROM users WHERE email = ?", email);
        // Always run verify to avoid timing leaks on missing users
        String hash = user == null ? "pbkdf2$100000$" + "ab".repeat(16) + "$" + "cd".repeat(32) : (String) user.get("password_hash");
        boolean ok = Password.verify(password, hash);
        if (user == null || !ok) { Json.error(resp, 401, "invalid_credentials", "Email or password is incorrect."); return; }

        int userId = ((Number) user.get("id")).intValue();
        Db.update("UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", userId);
        Auth.issueSession(userId, req, resp);
        Json.ok(resp, Json.obj("ok", true));
    }

    /* ───────── logout ───────── */
    private void logout(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
        String token = Auth.sessionTokenFromRequest(req);
        if (token != null) Auth.revokeSession(token);
        Auth.clearSessionCookie(resp);
        Json.ok(resp, Json.obj("ok", true));
    }

    /* ───────── me ───────── */
    private void me(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Map<String, Object> u = Auth.current(req);
        if (u == null) { Json.error(resp, 401, "unauthorized", ""); return; }
        Json.ok(resp, Json.obj("user", Json.obj(
            "id",        u.get("id"),
            "email",     u.get("email"),
            "full_name", u.get("full_name"),
            "timezone",  u.get("timezone")
        )));
    }

    /* ───────── forgot password ───────── */
    private void forgot(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
        JSONObject body = Json.readBody(req);
        String email = Json.str(body, "email").toLowerCase();
        if (!EMAIL_RE.matcher(email).matches()) { Json.error(resp, 422, "invalid_email", ""); return; }
        if (!RateLimit.hit("forgot:" + Auth.clientIp(req), 3, 600)) { Json.error(resp, 429, "rate_limited", ""); return; }

        Map<String, Object> u = Db.queryOne("SELECT id FROM users WHERE email = ?", email);
        if (u != null) {
            String token = Password.randomToken(32);
            Db.update(
                "INSERT INTO password_resets (user_id, token_hash, expires_at) " +
                "VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))",
                u.get("id"), Password.sha256Hex(token));
            // TODO dev: send email using jakarta.mail or an external API.
            // For now, log the link so you can test manually.
            log("password reset link for " + email + ": https://linalysis.com/reset-password.html?token=" + token);
        }
        // Same response whether or not the account exists
        Json.ok(resp, Json.obj("ok", true, "message", "If that email exists, a reset link is on its way."));
    }

    /* ───────── reset password ───────── */
    private void reset(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }
        JSONObject body = Json.readBody(req);
        String token    = Json.str(body, "token");
        String password = body.optString("password", "");
        if (password.length() < 10) { Json.error(resp, 422, "weak_password", ""); return; }

        Map<String, Object> row = Db.queryOne(
            "SELECT id, user_id FROM password_resets " +
            "WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()",
            Password.sha256Hex(token));
        if (row == null) { Json.error(resp, 400, "invalid_token", "Reset link is invalid or expired."); return; }

        Db.update("UPDATE users SET password_hash = ? WHERE id = ?",
            Password.hash(password), row.get("user_id"));
        Db.update("UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ?", row.get("id"));
        Db.update("DELETE FROM sessions WHERE user_id = ?", row.get("user_id"));
        Json.ok(resp, Json.obj("ok", true));
    }
}
