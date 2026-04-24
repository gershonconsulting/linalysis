<?php
declare(strict_types=1);

namespace Linalysis\Core;

final class Cors
{
    public static function handle(Request $req): void
    {
        $origin = $req->origin;
        $allowed = Config::corsOrigins();

        if ($origin && in_array($origin, $allowed, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Stripe-Signature');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 86400');
        }

        if ($req->method === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
