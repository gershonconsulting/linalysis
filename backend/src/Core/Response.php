<?php
declare(strict_types=1);

namespace Linalysis\Core;

final class Response
{
    private int $status = 200;
    private array $headers = ['Content-Type' => 'application/json; charset=utf-8'];
    private array $cookies = [];
    private string $body = '';

    public static function json(mixed $data, int $status = 200): self
    {
        $r = new self();
        $r->status = $status;
        $r->body = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return $r;
    }

    public static function error(string $code, string $message = '', int $status = 400, array $extra = []): self
    {
        return self::json(array_merge(['error' => $code, 'message' => $message], $extra), $status);
    }

    public static function noContent(): self
    {
        $r = new self();
        $r->status = 204;
        $r->body = '';
        return $r;
    }

    public static function text(string $text, int $status = 200): self
    {
        $r = new self();
        $r->status = $status;
        $r->headers['Content-Type'] = 'text/plain; charset=utf-8';
        $r->body = $text;
        return $r;
    }

    public function withHeader(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function withCookie(string $name, string $value, array $opts = []): self
    {
        $this->cookies[] = [
            'name' => $name,
            'value' => $value,
            'opts' => array_merge([
                'expires' => time() + 30 * 86400,
                'path' => '/',
                'domain' => Config::get('SESSION_COOKIE_DOMAIN'),
                'secure' => true,
                'httponly' => true,
                'samesite' => 'Lax',
            ], $opts),
        ];
        return $this;
    }

    public function withClearCookie(string $name): self
    {
        return $this->withCookie($name, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => Config::get('SESSION_COOKIE_DOMAIN'),
        ]);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header("$name: $value");
        }
        foreach ($this->cookies as $c) {
            setcookie($c['name'], $c['value'], $c['opts']);
        }
        echo $this->body;
    }
}
