<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Auth, Db, Request, Response};

/**
 * Replaces the 6 mocked troubleshooting checks:
 *   acct.session → /api/account           (session expiry from sessions row)
 *   acct.plan    → /api/account/subscription
 *   acct.usage   → /api/account/usage
 *   rep.email    → /api/account           (email_verified_at + SMTP config health)
 *   rep.lastsent → /api/reports/list
 *   rep.next     → /api/reports/next
 */
final class AccountController
{
    public function show(Request $req): Response
    {
        $user = Auth::require($req);

        // Session expiry (only if called via cookie)
        $session = null;
        if ($token = $req->sessionCookie()) {
            $session = Db::fetchOne(
                'SELECT expires_at FROM sessions WHERE id = :h',
                ['h' => hash('sha256', $token)]
            );
        }

        return Response::json([
            'user' => [
                'id'                => (int) $user['id'],
                'email'             => $user['email'],
                'full_name'         => $user['full_name'],
                'timezone'          => $user['timezone'],
                'email_verified'    => !empty($user['email_verified_at']),
            ],
            'session' => $session ? [
                'expires_at' => $session['expires_at'],
                'days_left'  => max(0, (int) ceil((strtotime($session['expires_at']) - time()) / 86400)),
            ] : null,
        ]);
    }

    public function subscription(Request $req): Response
    {
        $user = Auth::require($req);
        $sub = Db::fetchOne(
            'SELECT plan, status, amount_cents, currency, current_period_end, cancel_at_period_end
             FROM subscriptions WHERE user_id = :u',
            ['u' => $user['id']]
        );
        if (!$sub) {
            return Response::json(['plan' => 'free', 'status' => 'active']);
        }
        return Response::json([
            'plan'                 => $sub['plan'],
            'status'               => $sub['status'],
            'amount_cents'         => $sub['amount_cents'] ? (int) $sub['amount_cents'] : null,
            'currency'             => $sub['currency'],
            'current_period_end'   => $sub['current_period_end'],
            'cancel_at_period_end' => (bool) $sub['cancel_at_period_end'],
        ]);
    }

    public function usage(Request $req): Response
    {
        $user = Auth::require($req);

        $totalDays = (int) Db::fetchOne(
            'SELECT COUNT(*) AS n FROM linkedin_stats WHERE user_id = :u',
            ['u' => $user['id']]
        )['n'];

        $thisMonth = (int) Db::fetchOne(
            "SELECT COUNT(*) AS n FROM linkedin_stats
             WHERE user_id = :u AND captured_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')",
            ['u' => $user['id']]
        )['n'];

        $lastIngest = Db::fetchOne(
            'SELECT MAX(captured_at) AS d FROM linkedin_stats WHERE user_id = :u',
            ['u' => $user['id']]
        )['d'];

        $plan = Db::fetchOne('SELECT plan FROM subscriptions WHERE user_id = :u', ['u' => $user['id']])['plan'] ?? 'free';

        $limits = [
            'free'     => ['daily_ingests' => 1,  'api_calls' => 100,   'linkedin_accounts' => 1],
            'silver'   => ['daily_ingests' => 1,  'api_calls' => 500,   'linkedin_accounts' => 1],
            'gold'     => ['daily_ingests' => 1,  'api_calls' => 1000,  'linkedin_accounts' => 1],
            'platinum' => ['daily_ingests' => 3,  'api_calls' => 10000, 'linkedin_accounts' => 5],
        ][$plan] ?? ['daily_ingests' => 1, 'api_calls' => 100, 'linkedin_accounts' => 1];

        return Response::json([
            'plan'             => $plan,
            'limits'           => $limits,
            'stats_days_total' => $totalDays,
            'stats_this_month' => $thisMonth,
            'last_ingest'      => $lastIngest,
        ]);
    }

    /**
     * POST /api/account/token — generates a new Bearer token for the Chrome extension.
     */
    public function createToken(Request $req): Response
    {
        $user = Auth::require($req);
        $name = trim((string) $req->jsonField('name', 'Chrome extension'));
        $token = Auth::issueApiToken((int) $user['id'], $name);
        return Response::json([
            'token'   => $token,
            'name'    => $name,
            'warning' => 'This is the only time you will see this token. Copy it now.',
        ], 201);
    }
}
