package com.linalysis.servlets;

import com.linalysis.Config;
import com.linalysis.auth.Auth;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import com.linalysis.util.Password;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Map;

/**
 * Handles LinkedIn OAuth (OpenID Connect) sign-in.
 *
 *   GET /api/auth/linkedin/start?return_to=/dashboard.html
 *     → 302 to LinkedIn authorization URL
 *
 *   GET /api/auth/linkedin/callback?code=...&state=...
 *     → exchange code, fetch userinfo, find-or-create user, set session, 302 to return_to
 *
 * Configure these in linalysis.properties (or env vars LINALYSIS_LINKEDIN_CLIENT_ID/SECRET):
 *   linkedin.client.id     = 7874dx90zakhhq
 *   linkedin.client.secret = <set via dashboard or env, never commit>
 *   linkedin.redirect.uri  = https://api.linalysis.com/api/auth/linkedin/callback
 *   app.frontend.origin    = https://linalysis.com
 *
 * The `state` nonce is stored in the rate_limits table (re-using the existing
 * TTL'd KV-style table) — keys prefixed with "linkedin_state:". Single-use.
 *
 * Uses HttpURLConnection for the two HTTPS calls — JDK-builtin, no extra JAR.
 */
public class LinkedInOAuthServlet extends HttpServlet {

    private static final String LI_AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
    private static final String LI_TOKEN     = "https://www.linkedin.com/oauth/v2/accessToken";
    private static final String LI_USERINFO  = "https://api.linkedin.com/v2/userinfo";
    private static final String LI_SCOPES    = "openid profile email";
    private static final int STATE_TTL_SECONDS = 600;  // 10 min

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        String path = req.getServletPath() + (req.getPathInfo() == null ? "" : req.getPathInfo());
        try {
            switch (path) {
                case "/api/auth/linkedin/start"    -> start(req, resp);
                case "/api/auth/linkedin/callback" -> callback(req, resp);
                default -> Json.error(resp, 404, "not_found", path);
            }
        } catch (SQLException e) {
            log("LinkedIn OAuth SQL", e);
            Json.error(resp, 500, "db_error", e.getMessage());
        }
    }

    /* ───────── start ───────── */
    private void start(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        String clientId = Config.get("linkedin.client.id", "");
        if (clientId.isEmpty()) { Json.error(resp, 500, "unconfigured", "linkedin.client.id not set."); return; }

        String returnTo = req.getParameter("return_to");
        if (returnTo == null || returnTo.isEmpty()) returnTo = "/dashboard.html";

        String redirectUri = effectiveRedirectUri(req);
        String nonce = Password.randomToken(16);
        String stateValue = redirectUri + "|" + returnTo;  // packed; we'll split on retrieval

        // Store nonce + bind it to the redirect_uri/return_to. Re-use the rate_limits table:
        // id = sha256(nonce), expires in 10 min.
        Db.update(
            "INSERT INTO rate_limits (id, bucket_key, bucket_ts, hits, expires_at) " +
            "VALUES (?, ?, ?, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))",
            Password.sha256Hex(nonce),
            "linkedin_state:" + stateValue,
            System.currentTimeMillis() / 1000,
            STATE_TTL_SECONDS);

        StringBuilder url = new StringBuilder(LI_AUTHORIZE);
        url.append("?response_type=code");
        url.append("&client_id=").append(enc(clientId));
        url.append("&redirect_uri=").append(enc(redirectUri));
        url.append("&state=").append(enc(nonce));
        url.append("&scope=").append(enc(LI_SCOPES));

        resp.setStatus(302);
        resp.setHeader("Location", url.toString());
    }

    /* ───────── callback ───────── */
    private void callback(HttpServletRequest req, HttpServletResponse resp) throws IOException, SQLException {
        String clientId     = Config.get("linkedin.client.id", "");
        String clientSecret = Config.get("linkedin.client.secret", "");
        if (clientId.isEmpty() || clientSecret.isEmpty()) {
            Json.error(resp, 500, "unconfigured", "linkedin.client.id/secret not set.");
            return;
        }

        String code  = req.getParameter("code");
        String state = req.getParameter("state");
        String errp  = req.getParameter("error");
        if (errp != null) { redirectToFrontendError(resp, errp, req.getParameter("error_description")); return; }
        if (code == null || state == null) { Json.error(resp, 400, "bad_request", "Missing code or state"); return; }

        // Verify state (single-use)
        Map<String, Object> stateRow = Db.queryOne(
            "SELECT bucket_key FROM rate_limits WHERE id = ? AND expires_at > UTC_TIMESTAMP()",
            Password.sha256Hex(state));
        if (stateRow == null) { Json.error(resp, 400, "invalid_state", "State expired or unknown."); return; }
        Db.update("DELETE FROM rate_limits WHERE id = ?", Password.sha256Hex(state));

        String packed = (String) stateRow.get("bucket_key");
        String[] parts = packed.replaceFirst("^linkedin_state:", "").split("\\|", 2);
        String redirectUri = parts.length >= 1 ? parts[0] : effectiveRedirectUri(req);
        String returnTo    = parts.length >= 2 ? parts[1] : "/dashboard.html";

        // Exchange code → access_token
        String form = "grant_type=authorization_code"
            + "&code="          + enc(code)
            + "&client_id="     + enc(clientId)
            + "&client_secret=" + enc(clientSecret)
            + "&redirect_uri="  + enc(redirectUri);
        String tokenJson;
        try {
            tokenJson = httpsPost(LI_TOKEN, form, "application/x-www-form-urlencoded", null);
        } catch (IOException e) {
            log("token exchange failed", e);
            redirectToFrontendError(resp, "token_exchange_failed", e.getMessage());
            return;
        }
        JSONObject tokenObj = new JSONObject(tokenJson);
        String accessToken = tokenObj.optString("access_token", null);
        if (accessToken == null) { redirectToFrontendError(resp, "no_access_token", null); return; }

        // Fetch userinfo
        String uiJson;
        try {
            uiJson = httpsGet(LI_USERINFO, "Bearer " + accessToken);
        } catch (IOException e) {
            log("userinfo failed", e);
            redirectToFrontendError(resp, "userinfo_failed", e.getMessage());
            return;
        }
        JSONObject ui = new JSONObject(uiJson);
        String email = ui.optString("email", "").toLowerCase();
        if (email.isEmpty()) { redirectToFrontendError(resp, "no_email", null); return; }

        // Find-or-create user
        Map<String, Object> user = Db.queryOne("SELECT id FROM users WHERE email = ?", email);
        int userId;
        if (user == null) {
            // OAuth-only user — random password they'll never use directly
            long id = Db.insert(
                "INSERT INTO users (email, password_hash, full_name, email_verified_at, linkedin_profile) " +
                "VALUES (?, ?, ?, ?, ?)",
                email,
                Password.hash(Password.randomToken(16)),
                ui.optString("name", null),
                ui.optBoolean("email_verified", false) ? new java.sql.Timestamp(System.currentTimeMillis()) : null,
                ui.optString("sub", null));
            Db.update(
                "INSERT INTO subscriptions (user_id, plan, status) VALUES (?, 'free', 'active')",
                id);
            userId = (int) id;
        } else {
            userId = ((Number) user.get("id")).intValue();
            Db.update(
                "UPDATE users SET last_login_at = UTC_TIMESTAMP(), " +
                "linkedin_profile = COALESCE(linkedin_profile, ?), " +
                "full_name = COALESCE(full_name, ?), " +
                "email_verified_at = COALESCE(email_verified_at, ?) " +
                "WHERE id = ?",
                ui.optString("sub", null),
                ui.optString("name", null),
                ui.optBoolean("email_verified", false) ? new java.sql.Timestamp(System.currentTimeMillis()) : null,
                userId);
        }

        // Issue session + redirect to dashboard
        Auth.issueSession(userId, req, resp);
        String front = Config.get("app.frontend.origin", "https://linalysis.com");
        String dest = front + (returnTo.startsWith("/") ? returnTo : "/" + returnTo);
        resp.setStatus(302);
        resp.setHeader("Location", dest);
    }

    /* ───────── helpers ───────── */

    private String effectiveRedirectUri(HttpServletRequest req) {
        String configured = Config.get("linkedin.redirect.uri", "");
        if (!configured.isEmpty()) return configured;
        // Auto-build from the current request
        String scheme = "https".equalsIgnoreCase(req.getHeader("X-Forwarded-Proto")) ? "https" : req.getScheme();
        return scheme + "://" + req.getHeader("Host") + "/api/auth/linkedin/callback";
    }

    private void redirectToFrontendError(HttpServletResponse resp, String code, String message) {
        String front = Config.get("app.frontend.origin", "https://linalysis.com");
        StringBuilder url = new StringBuilder(front).append("/login.html?error=").append(enc(code));
        if (message != null && !message.isEmpty()) {
            url.append("&message=").append(enc(message.length() > 200 ? message.substring(0, 200) : message));
        }
        resp.setStatus(302);
        resp.setHeader("Location", url.toString());
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }

    private static String httpsPost(String urlStr, String body, String contentType, String authBearer) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setConnectTimeout(15_000);
        c.setReadTimeout(20_000);
        c.setRequestProperty("Content-Type", contentType);
        c.setRequestProperty("Accept", "application/json");
        if (authBearer != null) c.setRequestProperty("Authorization", authBearer);
        try (OutputStream os = c.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        int status = c.getResponseCode();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                status >= 400 ? c.getErrorStream() : c.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            if (status >= 400) throw new IOException("HTTP " + status + ": " + sb);
            return sb.toString();
        }
    }

    private static String httpsGet(String urlStr, String authBearer) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(urlStr).openConnection();
        c.setRequestMethod("GET");
        c.setConnectTimeout(15_000);
        c.setReadTimeout(20_000);
        c.setRequestProperty("Accept", "application/json");
        if (authBearer != null) c.setRequestProperty("Authorization", authBearer);
        int status = c.getResponseCode();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                status >= 400 ? c.getErrorStream() : c.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            if (status >= 400) throw new IOException("HTTP " + status + ": " + sb);
            return sb.toString();
        }
    }
}
