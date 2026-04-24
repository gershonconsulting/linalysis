<?php
declare(strict_types=1);

namespace Linalysis\Core;

/**
 * Minimal PSR-7-ish request wrapper. Captures method, path, headers, body, and
 * a parsed JSON payload in one place so controllers don't touch superglobals.
 */
final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $headers,
        public readonly array $cookies,
        public readonly string $body,
        public readonly ?array $json,
        public readonly string $ip,
        public readonly string $userAgent,
        public readonly string $origin,
    ) {}

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        // Strip trailing slash (except root)
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                $headers[$name] = $v;
            } elseif (in_array($k, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true)) {
                $headers[strtolower(str_replace('_', '-', $k))] = $v;
            }
        }

        $body = file_get_contents('php://input') ?: '';
        $json = null;
        if ($body !== '' && str_contains($headers['content-type'] ?? '', 'application/json')) {
            $decoded = json_decode($body, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $json = $decoded;
            }
        }

        // Trust Cloudflare's CF-Connecting-IP when present
        $ip = $headers['cf-connecting-ip']
            ?? $headers['x-forwarded-for']
            ?? $_SERVER['REMOTE_ADDR']
            ?? '0.0.0.0';
        if (str_contains($ip, ',')) {
            $ip = trim(explode(',', $ip)[0]);
        }

        return new self(
            method: $method,
            path: $path,
            query: $_GET ?? [],
            headers: $headers,
            cookies: $_COOKIE ?? [],
            body: $body,
            json: $json,
            ip: $ip,
            userAgent: $headers['user-agent'] ?? '',
            origin: $headers['origin'] ?? '',
        );
    }

    public function bearerToken(): ?string
    {
        $auth = $this->headers['authorization'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    public function sessionCookie(): ?string
    {
        return $this->cookies[Config::get('SESSION_COOKIE_NAME', 'linalysis_session')] ?? null;
    }

    public function jsonField(string $key, mixed $default = null): mixed
    {
        return $this->json[$key] ?? $default;
    }
}
