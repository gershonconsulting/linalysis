package com.linalysis.util;

import com.linalysis.Config;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

/**
 * Call from every servlet's service() (or via a Filter).
 *
 * Returns true if the request is an OPTIONS preflight that was fully handled —
 * the caller should simply return in that case.
 */
public final class Cors {
    private Cors() {}

    public static boolean handle(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String origin = req.getHeader("Origin");
        if (origin != null && allowed().contains(origin)) {
            resp.setHeader("Access-Control-Allow-Origin", origin);
            resp.setHeader("Vary", "Origin");
            resp.setHeader("Access-Control-Allow-Credentials", "true");
            resp.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
            resp.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            resp.setHeader("Access-Control-Max-Age", "86400");
        }
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            resp.setStatus(204);
            return true;
        }
        return false;
    }

    private static List<String> allowed() {
        String raw = Config.get("cors.origins", "https://linalysis.net,https://www.linalysis.net,https://linalysis.pages.dev,https://linalysis.com");
        return Arrays.asList(raw.split("\\s*,\\s*"));
    }
}
