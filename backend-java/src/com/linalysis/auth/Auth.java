package com.linalysis.auth;

import com.linalysis.Config;
import com.linalysis.db.Db;
import com.linalysis.util.Password;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.sql.SQLException;
import java.util.Map;

/**
 * Session-cookie OR Bearer-token authentication.
 * Session tokens live in the `sessions` table; API tokens in `api_tokens`.
 * Both are stored as SHA-256 hashes (never the raw token).
 */
public final class Auth {
    private Auth() {}

    private static String cookieName()   { return Config.get("session.cookie.name", "linalysis_session"); }
    private static String cookieDomain() { return Config.get("session.cookie.domain", ".linalysis.com"); }
    private static int sessionTtlDays()  { return Config.getInt("session.ttl.days", 30); }

    /** Returns the current user row (id, email, full_name, timezone) or null. */
    public static Map<String, Object> current(HttpServletRequest req) {
        // 1. Session cookie
        Cookie[] cookies = req.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (cookieName().equals(c.getName()) && c.getValue() != null && !c.getValue().isEmpty()) {
                    Map<String, Object> u = userBySession(c.getValue());
                    if (u != null) return u;
                }
            }
        }
        // 2. Bearer API token (extension)
        String auth = req.getHeader("Authorization");
        if (auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7)) {
            String token = auth.substring(7).trim();
            if (!token.isEmpty()) return userByApiToken(token);
        }
        return null;
    }

    private static Map<String, Object> userBySession(String token) {
        try {
            String hash = Password.sha256Hex(token);
            return Db.queryOne(
                "SELECT u.id, u.email, u.full_name, u.timezone, s.expires_at " +
                "FROM sessions s JOIN users u ON u.id = s.user_id " +
                "WHERE s.id = ? AND s.expires_at > UTC_TIMESTAMP()",
                hash);
        } catch (SQLException e) { return null; }
    }

    private static Map<String, Object> userByApiToken(String token) {
        try {
            String hash = Password.sha256Hex(token);
            Map<String, Object> row = Db.queryOne(
                "SELECT u.id, u.email, u.full_name, u.timezone, t.id AS token_id " +
                "FROM api_tokens t JOIN users u ON u.id = t.user_id " +
                "WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > UTC_TIMESTAMP())",
                hash);
            if (row != null) {
                try {
                    Db.update("UPDATE api_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = ?", row.get("token_id"));
                } catch (SQLException ignored) {}
            }
            return row;
        } catch (SQLException e) { return null; }
    }

    /** Mint a new session, set the cookie on the response, return the raw token. */
    public static String issueSession(int userId, HttpServletRequest req, HttpServletResponse resp) throws SQLException {
        String token = Password.randomToken(32);
        String hash = Password.sha256Hex(token);
        Db.update(
            "INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address) " +
            "VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY), ?, ?)",
            hash, userId, sessionTtlDays(),
            clip(req.getHeader("User-Agent"), 255),
            clientIp(req));
        setSessionCookie(resp, token);
        return token;
    }

    public static void revokeSession(String token) throws SQLException {
        Db.update("DELETE FROM sessions WHERE id = ?", Password.sha256Hex(token));
    }

    public static String issueApiToken(int userId, String name) throws SQLException {
        String token = "lnz_" + Password.randomToken(24);
        Db.update(
            "INSERT INTO api_tokens (user_id, token_hash, name) VALUES (?, ?, ?)",
            userId, Password.sha256Hex(token), clip(name, 100));
        return token;
    }

    public static void setSessionCookie(HttpServletResponse resp, String token) {
        // Build Set-Cookie manually so we can set SameSite (Cookie API in Servlet 5 doesn't expose SameSite).
        int maxAge = sessionTtlDays() * 86400;
        String header = cookieName() + "=" + token +
            "; Domain=" + cookieDomain() +
            "; Path=/" +
            "; Max-Age=" + maxAge +
            "; Secure; HttpOnly; SameSite=Lax";
        resp.addHeader("Set-Cookie", header);
    }

    public static void clearSessionCookie(HttpServletResponse resp) {
        String header = cookieName() + "=" +
            "; Domain=" + cookieDomain() +
            "; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";
        resp.addHeader("Set-Cookie", header);
    }

    public static String sessionTokenFromRequest(HttpServletRequest req) {
        Cookie[] cookies = req.getCookies();
        if (cookies != null) for (Cookie c : cookies) {
            if (cookieName().equals(c.getName())) return c.getValue();
        }
        return null;
    }

    public static String clientIp(HttpServletRequest req) {
        String cf = req.getHeader("CF-Connecting-IP");
        if (cf != null && !cf.isEmpty()) return cf;
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) return xff.split(",")[0].trim();
        return req.getRemoteAddr();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
