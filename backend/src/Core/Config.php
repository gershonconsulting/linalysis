<?php
declare(strict_types=1);

namespace Linalysis\Core;

/**
 * Simple env-backed config. Reads from $_ENV (populated by phpdotenv or the host).
 * Centralizing access here means we can swap the backing store (AWS Secrets Manager,
 * SSM Parameter Store, etc.) without touching callers.
 */
final class Config
{
    private static array $defaults = [
        'APP_ENV' => 'production',
        'APP_NAME' => 'Linalysis',
        'APP_URL' => 'https://api.linalysis.net',
        'APP_CORS_ORIGINS' => 'https://linalysis.net,https://www.linalysis.net,https://linalysis.pages.dev',
        'DB_HOST' => 'localhost',
        'DB_PORT' => '3306',
        'SESSION_COOKIE_NAME' => 'linalysis_session',
        'SESSION_COOKIE_DOMAIN' => '.linalysis.net',
        'SESSION_TTL_DAYS' => '30',
        'RATE_LIMIT_AUTH_PER_MINUTE' => '10',
        'RATE_LIMIT_INGEST_PER_HOUR' => '100',
    ];

    public static function load(): void
    {
        // no-op; values are read lazily via get()
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return (string) $_ENV[$key];
        }
        $env = getenv($key);
        if ($env !== false && $env !== '') {
            return $env;
        }
        return self::$defaults[$key] ?? $default;
    }

    public static function getInt(string $key, int $default = 0): int
    {
        $v = self::get($key);
        return $v === null ? $default : (int) $v;
    }

    public static function getBool(string $key, bool $default = false): bool
    {
        $v = self::get($key);
        if ($v === null) return $default;
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }

    public static function isProduction(): bool
    {
        return self::get('APP_ENV') === 'production';
    }

    public static function corsOrigins(): array
    {
        $raw = self::get('APP_CORS_ORIGINS', '');
        return array_filter(array_map('trim', explode(',', $raw ?? '')));
    }
}
