package com.linalysis.auth;

import com.linalysis.db.Db;
import com.linalysis.util.Password;

import java.sql.SQLException;
import java.util.Map;

/**
 * Coarse bucket counter in MySQL — same table the Cloudflare Worker used.
 * Fine for auth + ingest protection; swap for Redis if traffic grows.
 */
public final class RateLimit {
    private RateLimit() {}

    /** Returns true if request is allowed; false if caller should return 429. */
    public static boolean hit(String key, int limit, int windowSeconds) {
        long bucket = System.currentTimeMillis() / 1000 / windowSeconds;
        String id = Password.sha256Hex(key + "|" + bucket);
        try {
            Db.update(
                "INSERT INTO rate_limits (id, bucket_key, bucket_ts, hits, expires_at) " +
                "VALUES (?, ?, ?, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)) " +
                "ON DUPLICATE KEY UPDATE hits = hits + 1",
                id, key, bucket, windowSeconds);

            Map<String, Object> row = Db.queryOne("SELECT hits FROM rate_limits WHERE id = ?", id);
            if (row == null) return true;
            int hits = ((Number) row.get("hits")).intValue();
            return hits <= limit;
        } catch (SQLException e) {
            // Fail open — we'd rather accept a request than 500 the user
            return true;
        }
    }
}
