package com.linalysis.db;

import com.linalysis.Config;

import java.sql.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Raw JDBC. No HikariCP, no DataSource framework. Tomcat's JDBC pool (built-in)
 * can wire this up via context.xml if needed; for a bare install, connections are
 * opened per-request (fine for low traffic). Replace with a pool when the dev
 * wants to scale — that's a 20-line change.
 *
 * Usage:
 *   List<Map<String,Object>> rows = Db.query(
 *     "SELECT id, email FROM users WHERE created_at > ?", ts);
 *   int affected = Db.update("INSERT INTO ... (...) VALUES (?, ?)", v1, v2);
 */
public final class Db {
    private Db() {}

    private static String url()  { return Config.get("db.url",  "jdbc:mysql://localhost:3306/linalysis?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&characterEncoding=utf8mb4"); }
    private static String user() { return Config.get("db.user", "linalysis"); }
    private static String pass() { return Config.get("db.pass", ""); }

    public static Connection conn() throws SQLException {
        return DriverManager.getConnection(url(), user(), pass());
    }

    /** Prepared statement with positional parameters (?). */
    private static void bind(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
    }

    public static List<Map<String, Object>> query(String sql, Object... params) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                int cols = md.getColumnCount();
                List<Map<String, Object>> out = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= cols; i++) row.put(md.getColumnLabel(i), rs.getObject(i));
                    out.add(row);
                }
                return out;
            }
        }
    }

    /** Returns the first row or null. */
    public static Map<String, Object> queryOne(String sql, Object... params) throws SQLException {
        List<Map<String, Object>> rows = query(sql, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public static int update(String sql, Object... params) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            return ps.executeUpdate();
        }
    }

    /** Insert + return generated id (assumes auto-increment primary key). */
    public static long insert(String sql, Object... params) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bind(ps, params);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                return keys.next() ? keys.getLong(1) : 0;
            }
        }
    }

    /** Quick connectivity check — used by /api/health. */
    public static boolean ping() {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("SELECT 1")) {
            try (ResultSet rs = ps.executeQuery()) { return rs.next(); }
        } catch (SQLException e) {
            return false;
        }
    }
}
