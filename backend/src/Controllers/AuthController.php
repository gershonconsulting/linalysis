<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Auth, Config, Db, RateLimit, RateLimitExceeded, Request, Response};
use Linalysis\Services\Mailer;

final class AuthController
{
    // -------------------------------------------------------------------
    // POST /api/auth/signup
    // -------------------------------------------------------------------
    public function signup(Request $req): Response
    {
        $email    = strtolower(trim((string) $req->jsonField('email', '')));
        $password = (string) $req->jsonField('password', '');
        $fullName = trim((string) $req->jsonField('full_name', ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return Response::error('invalid_email', 'Enter a valid email.', 422);
        }
        if (strlen($password) < 10) {
            return Response::error('weak_password', 'Password must be at least 10 characters.', 422);
        }

        try {
            RateLimit::hit('signup:' . $req->ip, 5, 300);
        } catch (RateLimitExceeded $e) {
            return Response::error('rate_limited', 'Too many attempts — try again in a few minutes.', 429);
        }

        $existing = Db::fetchOne('SELECT id FROM users WHERE email = :e', ['e' => $email]);
        if ($existing) {
            return Response::error('email_taken', 'An account with this email already exists.', 409);
        }

        $userId = Db::insert(
            'INSERT INTO users (email, password_hash, full_name) VALUES (:e, :p, :n)',
            ['e' => $email, 'p' => Auth::hashPassword($password), 'n' => $fullName ?: null]
        );
        Db::execute(
            'INSERT INTO subscriptions (user_id, plan, status) VALUES (:u, "free", "active")',
            ['u' => $userId]
        );

        $token = Auth::issueSession($userId, $req);
        return Response::json(['ok' => true, 'user' => ['id' => $userId, 'email' => $email]], 201)
            ->withCookie(Config::get('SESSION_COOKIE_NAME'), $token);
    }

    // -------------------------------------------------------------------
    // POST /api/auth/login
    // -------------------------------------------------------------------
    public function login(Request $req): Response
    {
        $email    = strtolower(trim((string) $req->jsonField('email', '')));
        $password = (string) $req->jsonField('password', '');

        try {
            RateLimit::hit('login:' . $req->ip, Config::getInt('RATE_LIMIT_AUTH_PER_MINUTE', 10), 60);
        } catch (RateLimitExceeded $e) {
            return Response::error('rate_limited', 'Too many attempts.', 429);
        }

        $user = Db::fetchOne('SELECT id, password_hash FROM users WHERE email = :e', ['e' => $email]);

        // Constant-time-ish: verify even if user is missing, with a dummy hash
        $hash = $user['password_hash'] ?? '$2y$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
        if (!Auth::verifyPassword($password, $hash) || !$user) {
            return Response::error('invalid_credentials', 'Email or password is incorrect.', 401);
        }

        Db::execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $user['id']]);
        $token = Auth::issueSession((int) $user['id'], $req);

        return Response::json(['ok' => true])
            ->withCookie(Config::get('SESSION_COOKIE_NAME'), $token);
    }

    // -------------------------------------------------------------------
    // POST /api/auth/logout
    // -------------------------------------------------------------------
    public function logout(Request $req): Response
    {
        $token = $req->sessionCookie();
        if ($token) Auth::revokeSession($token);
        return Response::json(['ok' => true])
            ->withClearCookie(Config::get('SESSION_COOKIE_NAME'));
    }

    // -------------------------------------------------------------------
    // GET /api/auth/me
    // -------------------------------------------------------------------
    public function me(Request $req): Response
    {
        $user = Auth::currentUser($req);
        if (!$user) return Response::error('unauthorized', '', 401);
        return Response::json([
            'user' => [
                'id' => (int) $user['id'],
                'email' => $user['email'],
                'full_name' => $user['full_name'],
                'timezone' => $user['timezone'],
            ],
        ]);
    }

    // -------------------------------------------------------------------
    // POST /api/auth/forgot
    // -------------------------------------------------------------------
    public function forgot(Request $req): Response
    {
        $email = strtolower(trim((string) $req->jsonField('email', '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return Response::error('invalid_email', 'Enter a valid email.', 422);
        }

        try { RateLimit::hit('forgot:' . $req->ip, 3, 600); }
        catch (RateLimitExceeded $e) { return Response::error('rate_limited', '', 429); }

        $user = Db::fetchOne('SELECT id FROM users WHERE email = :e', ['e' => $email]);
        // Respond identically whether or not the account exists (privacy)
        if ($user) {
            $token = bin2hex(random_bytes(32));
            $hash = hash('sha256', $token);
            Db::execute(
                'INSERT INTO password_resets (user_id, token_hash, expires_at)
                 VALUES (:u, :h, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
                ['u' => $user['id'], 'h' => $hash]
            );
            $url = 'https://linalysis.net/reset-password.html?token=' . urlencode($token);
            try {
                (new Mailer())->send($email, 'Reset your Linalysis password',
                    "Click to reset your password:\n\n$url\n\nExpires in 1 hour.");
            } catch (\Throwable $e) {
                error_log('[linalysis] forgot email failed: ' . $e->getMessage());
            }
        }

        return Response::json(['ok' => true, 'message' => 'If that email exists, a reset link is on its way.']);
    }

    // -------------------------------------------------------------------
    // POST /api/auth/reset
    // -------------------------------------------------------------------
    public function reset(Request $req): Response
    {
        $token    = (string) $req->jsonField('token', '');
        $password = (string) $req->jsonField('password', '');

        if (strlen($password) < 10) {
            return Response::error('weak_password', 'Password must be at least 10 characters.', 422);
        }

        $hash = hash('sha256', $token);
        $row = Db::fetchOne(
            'SELECT id, user_id FROM password_resets
             WHERE token_hash = :h AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            ['h' => $hash]
        );
        if (!$row) return Response::error('invalid_token', 'Reset link is invalid or expired.', 400);

        Db::transaction(function () use ($row, $password) {
            Db::execute('UPDATE users SET password_hash = :p WHERE id = :u',
                ['p' => Auth::hashPassword($password), 'u' => $row['user_id']]);
            Db::execute('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = :id',
                ['id' => $row['id']]);
            // Invalidate all existing sessions for this user
            Db::execute('DELETE FROM sessions WHERE user_id = :u', ['u' => $row['user_id']]);
        });

        return Response::json(['ok' => true, 'message' => 'Password updated. You can sign in.']);
    }
}
