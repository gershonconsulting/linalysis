package com.linalysis.servlets;

import com.linalysis.Config;
import com.linalysis.db.Db;
import com.linalysis.util.Cors;
import com.linalysis.util.Json;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.json.JSONObject;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Map;

/**
 * POST /api/stripe/webhook
 *
 * Verifies signature with HMAC-SHA256 (JDK built-in, no JAR).
 * Handles: checkout.session.completed, customer.subscription.(created|updated|deleted),
 *          invoice.payment_succeeded, invoice.payment_failed.
 *
 * Configure Stripe dashboard → Developers → Webhooks:
 *   URL: https://api.linalysis.com/api/stripe/webhook
 *   Copy the signing secret → set stripe.webhook.secret in linalysis.properties
 */
public class StripeWebhookServlet extends HttpServlet {
    private static final long SIGNATURE_DRIFT_SECONDS = 600; // 10 minutes

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (Cors.handle(req, resp)) return;
        if (!"POST".equalsIgnoreCase(req.getMethod())) { Json.error(resp, 405, "method_not_allowed", ""); return; }

        String secret = Config.get("stripe.webhook.secret", "");
        if (secret.isEmpty()) { Json.error(resp, 500, "unconfigured", "Stripe webhook secret not set."); return; }

        String sig = req.getHeader("Stripe-Signature");
        if (sig == null) { Json.error(resp, 400, "missing_signature", ""); return; }

        // Read raw body
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = req.getReader()) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
        }
        String body = sb.toString();

        if (!verifySignature(body, sig, secret)) {
            Json.error(resp, 400, "invalid_signature", "");
            return;
        }

        JSONObject event = new JSONObject(body);
        String eventId   = event.optString("id");
        String eventType = event.optString("type");

        // Idempotency
        try {
            Db.update(
                "INSERT INTO webhook_events (provider, event_id, event_type, payload) VALUES ('stripe', ?, ?, ?)",
                eventId, eventType, event.toString());
        } catch (SQLException e) {
            if ("23000".equals(e.getSQLState())) {
                Json.ok(resp, Json.obj("ok", true, "duplicate", true));
                return;
            }
            Json.error(resp, 500, "db_error", e.getMessage());
            return;
        }

        try {
            handle(event);
            Db.update("UPDATE webhook_events SET processed_at = UTC_TIMESTAMP() WHERE event_id = ?", eventId);
        } catch (Exception e) {
            log("Stripe handle failed: " + eventType, e);
            try {
                Db.update("UPDATE webhook_events SET error_message = ? WHERE event_id = ?",
                    truncate(e.getMessage(), 500), eventId);
            } catch (SQLException ignored) {}
            // Return 200 so Stripe doesn't retry forever; we'll replay from our table
            Json.ok(resp, Json.obj("ok", false, "handled", false));
            return;
        }
        Json.ok(resp, Json.obj("ok", true));
    }

    private void handle(JSONObject event) throws SQLException {
        String type = event.optString("type");
        JSONObject obj = event.getJSONObject("data").optJSONObject("object");
        if (obj == null) return;

        switch (type) {
            case "checkout.session.completed" -> onCheckoutCompleted(obj);
            case "customer.subscription.created", "customer.subscription.updated" -> syncSubscription(obj);
            case "customer.subscription.deleted" -> {
                Db.update(
                    "UPDATE subscriptions SET status = 'canceled', plan = 'free' WHERE stripe_subscription_id = ?",
                    obj.optString("id"));
            }
            // invoice events: status is refreshed by subsequent subscription.updated event
            default -> {}
        }
    }

    private void onCheckoutCompleted(JSONObject obj) throws SQLException {
        String email = "";
        JSONObject details = obj.optJSONObject("customer_details");
        if (details != null) email = details.optString("email", "").toLowerCase();
        if (email.isEmpty()) email = obj.optString("customer_email", "").toLowerCase();
        if (email.isEmpty()) return;

        Map<String, Object> user = Db.queryOne("SELECT id FROM users WHERE email = ?", email);
        if (user == null) return;

        Db.update(
            "INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status) " +
            "VALUES (?, ?, ?, 'gold', 'active') " +
            "ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id), " +
            "stripe_subscription_id = VALUES(stripe_subscription_id), status = 'active'",
            user.get("id"),
            obj.optString("customer", null),
            obj.optString("subscription", null));
    }

    private void syncSubscription(JSONObject sub) throws SQLException {
        String customerId = sub.optString("customer", null);
        if (customerId == null) return;

        // Try to find user by customer_id via our reverse index (audit_log or... just email via users table if we stored customer_id)
        Map<String, Object> row = Db.queryOne("SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?", customerId);
        Integer userId = row == null ? null : ((Number) row.get("user_id")).intValue();

        Integer amountCents = null;
        String plan = "free";
        JSONObject items = sub.optJSONObject("items");
        if (items != null && items.has("data")) {
            var arr = items.getJSONArray("data");
            if (arr.length() > 0) {
                JSONObject price = arr.getJSONObject(0).optJSONObject("price");
                if (price != null) {
                    amountCents = price.optInt("unit_amount", 0);
                    plan = planFromAmount(amountCents);
                }
            }
        }
        if (userId == null) return;  // unknown customer; skip

        long pStart = sub.optLong("current_period_start", 0);
        long pEnd   = sub.optLong("current_period_end", 0);
        String status = sub.optString("status", "active");
        boolean cancel = sub.optBoolean("cancel_at_period_end", false);
        String currency = sub.optString("currency", "usd").toUpperCase();
        String subId = sub.optString("id", null);

        Db.update(
            "INSERT INTO subscriptions " +
            "(user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end, amount_cents, currency, cancel_at_period_end) " +
            "VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id), stripe_subscription_id = VALUES(stripe_subscription_id), " +
            "plan = VALUES(plan), status = VALUES(status), current_period_start = VALUES(current_period_start), " +
            "current_period_end = VALUES(current_period_end), amount_cents = VALUES(amount_cents), " +
            "currency = VALUES(currency), cancel_at_period_end = VALUES(cancel_at_period_end)",
            userId, customerId, subId, plan, status, pStart, pEnd, amountCents, currency, cancel ? 1 : 0);
    }

    private static String planFromAmount(Integer cents) {
        if (cents == null) return "free";
        if (cents < 1000) return "silver";
        if (cents < 2500) return "gold";
        return "platinum";
    }

    /** Verify Stripe-Signature header: t=TS,v1=SIG. */
    private static boolean verifySignature(String payload, String header, String secret) {
        Long ts = null;
        String v1 = null;
        for (String part : header.split(",")) {
            String[] kv = part.split("=", 2);
            if (kv.length != 2) continue;
            if ("t".equals(kv[0])) try { ts = Long.parseLong(kv[1]); } catch (Exception ignored) {}
            else if ("v1".equals(kv[0])) v1 = kv[1];
        }
        if (ts == null || v1 == null) return false;
        if (Math.abs(System.currentTimeMillis() / 1000 - ts) > SIGNATURE_DRIFT_SECONDS) return false;

        try {
            String signedPayload = ts + "." + payload;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
            String expectedHex = com.linalysis.util.Password.hex(expected);
            return constantTimeEq(expectedHex, v1);
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean constantTimeEq(String a, String b) {
        if (a.length() != b.length()) return false;
        int d = 0;
        for (int i = 0; i < a.length(); i++) d |= a.charAt(i) ^ b.charAt(i);
        return d == 0;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
