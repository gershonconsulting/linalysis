<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Auth, Config, Db, RateLimit, RateLimitExceeded, Request, Response};

/**
 * POST /api/ingest/linkedin
 *
 * Chrome extension POSTs an array of rows (one per day) in this exact shape:
 * {
 *   "rows": [
 *     {
 *       "Date": "2026-03-27",
 *       "Connections": 29355,
 *       "Search Appearance": 921,
 *       "Views": 1418,
 *       "Invitations": 531,
 *       "SSI Industry": 1,
 *       "SSI Network": 1,
 *       "SSI": 70,
 *       "Company Followers": 1314,
 *       "Company Search Appearances": 21,
 *       "Company Unique Visitors": 78,
 *       "Company New Followers": 5,
 *       "Company Post Impressions": 13,
 *       "Company Custom Clicks": 2,
 *       "Company Credits Available": 43,
 *       "Company Credits Total": 0
 *     }, ...
 *   ]
 * }
 *
 * Auth: Authorization: Bearer lnz_xxxxxxxx (generated via /api/account/token)
 */
final class IngestController
{
    private const CSV_TO_COL = [
        'Date'                       => 'captured_at',
        'Connections'                => 'connections',
        'Search Appearance'          => 'search_appearances',
        'Search Appearances'         => 'search_appearances',
        'Views'                      => 'profile_views',
        'Profile Views'              => 'profile_views',
        'Invitations'                => 'invitations',
        'SSI Industry'               => 'ssi_industry_rank',
        'SSI Network'                => 'ssi_network_rank',
        'SSI'                        => 'ssi_overall',
        'Company Followers'          => 'company_followers',
        'Company Search Appearances' => 'company_search_appearances',
        'Company Unique Visitors'    => 'company_unique_visitors',
        'Company New Followers'      => 'company_new_followers',
        'Company Post Impressions'   => 'company_post_impressions',
        'Company Custom Clicks'      => 'company_custom_clicks',
        'Company Credits Available'  => 'company_credits_available',
        'Company Credits Total'      => 'company_credits_total',
    ];

    public function linkedin(Request $req): Response
    {
        $user = Auth::require($req);

        try {
            RateLimit::hit(
                'ingest:' . $user['id'],
                Config::getInt('RATE_LIMIT_INGEST_PER_HOUR', 100),
                3600
            );
        } catch (RateLimitExceeded $e) {
            return Response::error('rate_limited', 'Too many ingests this hour.', 429, ['retry_after' => $e->retryAfter]);
        }

        $rows = $req->jsonField('rows', []);
        if (!is_array($rows) || empty($rows)) {
            return Response::error('invalid_payload', 'Expected {rows: [...]}', 422);
        }
        if (count($rows) > 1000) {
            return Response::error('too_many_rows', 'Max 1000 rows per request.', 413);
        }

        $inserted = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        Db::transaction(function () use ($rows, $user, &$inserted, &$updated, &$skipped, &$errors) {
            foreach ($rows as $i => $raw) {
                if (!is_array($raw)) { $errors[] = "Row $i: not an object"; $skipped++; continue; }

                $mapped = ['user_id' => $user['id']];
                $unmapped = [];
                foreach ($raw as $k => $v) {
                    $col = self::CSV_TO_COL[$k] ?? null;
                    if ($col) {
                        $mapped[$col] = $v;
                    } else {
                        $unmapped[$k] = $v;
                    }
                }

                if (empty($mapped['captured_at'])) { $errors[] = "Row $i: missing Date"; $skipped++; continue; }

                // Validate the date
                $d = \DateTime::createFromFormat('Y-m-d', $mapped['captured_at']);
                if (!$d) { $errors[] = "Row $i: invalid date format"; $skipped++; continue; }

                if (!empty($unmapped)) {
                    $mapped['raw_json'] = json_encode($unmapped);
                }

                $columns = array_keys($mapped);
                $placeholders = array_map(fn($c) => ":$c", $columns);
                $updateClauses = array_map(
                    fn($c) => "$c = VALUES($c)",
                    array_diff($columns, ['user_id', 'captured_at'])
                );

                $sql = 'INSERT INTO linkedin_stats (' . implode(',', $columns) . ')
                        VALUES (' . implode(',', $placeholders) . ')
                        ON DUPLICATE KEY UPDATE ' . implode(', ', $updateClauses);

                $existing = Db::fetchOne(
                    'SELECT id FROM linkedin_stats WHERE user_id = :u AND captured_at = :d',
                    ['u' => $user['id'], 'd' => $mapped['captured_at']]
                );
                Db::execute($sql, $mapped);
                if ($existing) $updated++; else $inserted++;
            }
        });

        Db::execute(
            "INSERT INTO audit_log (user_id, action, metadata, ip_address, user_agent)
             VALUES (:u, 'ingest', :meta, :ip, :ua)",
            [
                'u' => $user['id'],
                'meta' => json_encode(['inserted' => $inserted, 'updated' => $updated, 'skipped' => $skipped]),
                'ip' => $req->ip,
                'ua' => substr($req->userAgent, 0, 255),
            ]
        );

        return Response::json([
            'ok'       => true,
            'inserted' => $inserted,
            'updated'  => $updated,
            'skipped'  => $skipped,
            'errors'   => $errors,
        ]);
    }
}
