package com.linalysis;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Reads linalysis.properties from the classpath (WEB-INF/classes/).
 * No framework, no @Inject — just a static holder.
 *
 * Drop a copy of linalysis.properties.example into WEB-INF/classes/linalysis.properties
 * and edit for your environment.
 */
public final class Config {
    private static final Properties P = new Properties();
    private static boolean loaded = false;

    private Config() {}

    public static synchronized void load() {
        if (loaded) return;
        try (InputStream in = Config.class.getResourceAsStream("/linalysis.properties")) {
            if (in != null) P.load(in);
        } catch (IOException e) {
            System.err.println("[linalysis] config load failed: " + e.getMessage());
        }
        // Allow environment variables to override (useful for Tomcat setenv.sh)
        for (String k : P.stringPropertyNames()) {
            String env = System.getenv("LINALYSIS_" + k.toUpperCase().replace('.', '_'));
            if (env != null && !env.isEmpty()) P.setProperty(k, env);
        }
        loaded = true;
    }

    public static String get(String key) {
        if (!loaded) load();
        return P.getProperty(key);
    }

    public static String get(String key, String defaultValue) {
        String v = get(key);
        return (v == null || v.isEmpty()) ? defaultValue : v;
    }

    public static int getInt(String key, int defaultValue) {
        String v = get(key);
        if (v == null || v.isEmpty()) return defaultValue;
        try { return Integer.parseInt(v); } catch (NumberFormatException e) { return defaultValue; }
    }

    public static boolean getBool(String key, boolean defaultValue) {
        String v = get(key);
        if (v == null) return defaultValue;
        return "true".equalsIgnoreCase(v) || "1".equals(v) || "yes".equalsIgnoreCase(v);
    }
}
