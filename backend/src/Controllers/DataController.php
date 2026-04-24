<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Auth, Db, Request, Response};

/**
 * Replaces data.js (the 91 KB embedded CSV) with a real per-user API.
 *
 * If the caller isn't authenticated we return HTTP 401 — the frontend falls
 * back to demo data. Once auth is live, every dashboard/summary chart reads
 * its own user's rows.
 */
final class DataController
{
    public function summary(Request $req): Response
    {
        $user = Auth::require($req);
        $uid = (int) $user['id'];

        $latest = Db::fetchOne(
            "SELECT * FROM linkedin_stats WHERE user_id = :u ORDER BY captured_at DESC LIMIT 1",
            ['u' => $uid]
        );
        $weekAgo = Db::fetchOne(
            "SELECT * FROM linkedin_stats WHERE user_id = :u AND captured_at <= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             ORDER BY captured_at DESC LIMIT 1",
            ['u' => $uid]
        );
        $monthAgo = Db::fetchOne(
            "SELECT * FROM linkedin_stats WHERE user_id = :u AND captured_at <= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             ORDER BY captured_at DESC LIMIT 1",
            ['u' => $uid]
        );

        if (!$latest) {
            return Response::json(['empty' => true, 'message' => 'No LinkedIn data yet. Run the extension sync.']);
        }

        return Response::json([
            'as_of'  => $latest['captured_at'],
            'now'    => $this->tidy($latest),
            'deltas' => [
                'vs_7d'  => $weekAgo  ? $this->delta($latest, $weekAgo)  : null,
                'vs_30d' => $monthAgo ? $this->delta($latest, $monthAgo) : null,
            ],
        ]);
    }

    public function connections(Request $req): Response
    {
        $user = Auth::require($req);
        $range = max(1, min(3650, (int) ($req->query['range'] ?? 30)));
        $rows = Db::fetchAll(
            "SELECT captured_at, connections, invitations
             FROM linkedin_stats
             WHERE user_id = :u AND captured_at >= DATE_SUB(CURDATE(), INTERVAL :r DAY)
             ORDER BY captured_at ASC",
            ['u' => $user['id'], 'r' => $range]
        );
        return Response::json(['series' => $rows, 'range_days' => $range]);
    }

    public function ssi(Request $req): Response
    {
        $user = Auth::require($req);
        $range = max(1, min(3650, (int) ($req->query['range'] ?? 90)));
        $rows = Db::fetchAll(
            "SELECT captured_at, ssi_overall, ssi_industry_rank, ssi_network_rank
             FROM linkedin_stats
             WHERE user_id = :u AND captured_at >= DATE_SUB(CURDATE(), INTERVAL :r DAY)
             ORDER BY captured_at ASC",
            ['u' => $user['id'], 'r' => $range]
        );
        return Response::json(['series' => $rows, 'range_days' => $range]);
    }

    public function company(Request $req): Response
    {
        $user = Auth::require($req);
        $range = max(1, min(3650, (int) ($req->query['range'] ?? 30)));
        $rows = Db::fetchAll(
            "SELECT captured_at, company_followers, company_new_followers,
                    company_unique_visitors, company_post_impressions,
                    company_custom_clicks, company_search_appearances,
                    company_credits_available, company_credits_total
             FROM linkedin_stats
             WHERE user_id = :u AND captured_at >= DATE_SUB(CURDATE(), INTERVAL :r DAY)
             ORDER BY captured_at ASC",
            ['u' => $user['id'], 'r' => $range]
        );
        return Response::json(['series' => $rows, 'range_days' => $range]);
    }

    /** Strip internal columns from a stats row before sending to the client. */
    private function tidy(array $row): array
    {
        unset($row['id'], $row['user_id'], $row['raw_json'], $row['created_at']);
        return $row;
    }

    private function delta(array $now, array $then): array
    {
        $out = [];
        foreach ($now as $k => $v) {
            if (!is_numeric($v) || !isset($then[$k]) || !is_numeric($then[$k])) continue;
            $out[$k] = (int) $v - (int) $then[$k];
        }
        return $out;
    }
}
