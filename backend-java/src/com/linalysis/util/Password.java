package com.linalysis.util;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * PBKDF2-SHA256 password hashing. JDK-builtin (no JAR needed).
 * Storage format: "pbkdf2$ITERATIONS$SALT_HEX$HASH_HEX"
 *
 * The format matches the Cloudflare Worker version so a later migration
 * from the Worker's KV storage → MySQL is a straight copy of password_hash.
 */
public final class Password {
    private static final int ITERATIONS = 100_000;
    private static final int SALT_BYTES = 16;
    private static final int HASH_BITS  = 256;
    private static final SecureRandom RNG = new SecureRandom();

    private Password() {}

    public static String hash(String password) {
        try {
            byte[] salt = new byte[SALT_BYTES];
            RNG.nextBytes(salt);
            byte[] hash = pbkdf2(password.toCharArray(), salt, ITERATIONS, HASH_BITS);
            return "pbkdf2$" + ITERATIONS + "$" + hex(salt) + "$" + hex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Password hash failed", e);
        }
    }

    public static boolean verify(String password, String stored) {
        if (stored == null) return false;
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !"pbkdf2".equals(parts[0])) return false;
        try {
            int iters = Integer.parseInt(parts[1]);
            byte[] salt = unhex(parts[2]);
            byte[] expected = unhex(parts[3]);
            byte[] got = pbkdf2(password.toCharArray(), salt, iters, expected.length * 8);
            return constantTimeEq(expected, got);
        } catch (Exception e) {
            return false;
        }
    }

    private static byte[] pbkdf2(char[] pw, byte[] salt, int iters, int bits) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pw, salt, iters, bits);
        try {
            SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return f.generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    /** Arbitrary random token, hex-encoded (for session ids, API tokens, reset tokens). */
    public static String randomToken(int bytes) {
        byte[] b = new byte[bytes];
        RNG.nextBytes(b);
        return hex(b);
    }

    public static String sha256Hex(String s) {
        try {
            byte[] h = java.security.MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"));
            return hex(h);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /* ───────── helpers ───────── */

    public static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    public static byte[] unhex(String s) {
        int n = s.length() / 2;
        byte[] b = new byte[n];
        for (int i = 0; i < n; i++) b[i] = (byte) Integer.parseInt(s.substring(i*2, i*2+2), 16);
        return b;
    }

    private static boolean constantTimeEq(byte[] a, byte[] b) {
        if (a.length != b.length) return false;
        int d = 0;
        for (int i = 0; i < a.length; i++) d |= a[i] ^ b[i];
        return d == 0;
    }
}
