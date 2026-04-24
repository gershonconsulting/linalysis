<?php
declare(strict_types=1);

namespace Linalysis\Core;

/**
 * Auth helpers — resolves the current user from either a session cookie
 * (browser) or a Bearer API token (Chrome extension).
 *
 * Returns user array (id, email, full_name, timezone) or null.
 */
final class Auth
{
    public static function currentUser(Request $req): ?array
    {
        $sess = $req->sessionCookie();
        if ($sess) {
            $user = self::userBySession($sess);
            if ($user) return $user;
        }

        $bearer = $req->bearerToken();
        if ($bearer) {
            $user = self::userByApiToken($bearer);
            if ($user) return $user;
        }

        return null;
    }

    public static function require(Request $req): array
    {
        $user = self::currentUser($req);
        if (!$user) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'unauthorized', 'message' => 'Sign in required.']);
            exit;
        }
        return $user;
    }

    private static function userBySession(string $token): ?array
    {
        // token stored as sha256 — never the raw token in DB
        $hash = hash('sha256', $token);
        $row = Db::fetchOne(
            "SELECT u.id, u.email, u.full_name, u.timezone, s.expires_at
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.id = :h AND s.expires_at > UTC_TIMESTAMP()",
            ['h' => $hash]
        );
        return $row;
    }

    private static function userByApiToken(string $token): ?array
    {
        $hash = hash('sha256', $token);
        $row = Db::fetchOne(
            "SELECT u.id, u.email, u.full_name, u.timezone, t.id AS token_id
             FROM api_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = :h
               AND (t.expires_at IS NULL OR t.expires_at > UTC_TIMESTAMP())",
            ['h' => $hash]
        );
        if ($row) {
            // Best-effort: update last_used_at without blocking
            try {
                Db::execute(
                    "UPDATE api_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = :id",
                    ['id' => $row['token_id']]
                );
            } catch (\Throwable $e) { /* ignore */ }
        }
        return $row;
    }

    public static function issueSession(int $userId, Request $req): string
    {
        $token = bin2hex(random_bytes(32)); // 64 hex chars
        $hash  = hash('sha256', $token);
        $ttl   = Config::getInt('SESSION_TTL_DAYS', 30);
        Db::execute(
            "INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address)
             VALUES (:h, :u, DATE_ADD(UTC_TIMESTAMP(), INTERVAL :d DAY), :ua, :ip)",
            ['h' => $hash, 'u' => $userId, 'd' => $ttl, 'ua' => substr($req->userAgent, 0, 255), 'ip' => $req->ip]
        );
        return $token;
    }

    public static function revokeSession(string $token): void
    {
        Db::execute("DELETE FROM sessions WHERE id = :h", ['h' => hash('sha256', $token)]);
    }

    public static function issueApiToken(int $userId, string $name = ''): string
    {
        $token = 'lnz_' . bin2hex(random_bytes(24));  // 52 chars prefixed
        $hash  = hash('sha256', $token);
        Db::execute(
            "INSERT INTO api_tokens (user_id, token_hash, name)
             VALUES (:u, :h, :n)",
            ['u' => $userId, 'h' => $hash, 'n' => substr($name, 0, 100)]
        );
        return $token;
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 11]);
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }
}
