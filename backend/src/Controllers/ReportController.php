<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Auth, Db, Request, Response};

final class ReportController
{
    public function listDeliveries(Request $req): Response
    {
        $user = Auth::require($req);
        $rows = Db::fetchAll(
            "SELECT report_type, period_start, period_end, scheduled_for, sent_at, opened_at, status, subject
             FROM report_deliveries
             WHERE user_id = :u
             ORDER BY scheduled_for DESC LIMIT 20",
            ['u' => $user['id']]
        );
        $lastSent = Db::fetchOne(
            "SELECT sent_at, report_type FROM report_deliveries
             WHERE user_id = :u AND status = 'sent'
             ORDER BY sent_at DESC LIMIT 1",
            ['u' => $user['id']]
        );
        return Response::json([
            'deliveries' => $rows,
            'last_sent'  => $lastSent,
        ]);
    }

    public function nextScheduled(Request $req): Response
    {
        $user = Auth::require($req);
        $next = Db::fetchOne(
            "SELECT report_type, scheduled_for FROM report_deliveries
             WHERE user_id = :u AND status = 'pending' AND scheduled_for > UTC_TIMESTAMP()
             ORDER BY scheduled_for ASC LIMIT 1",
            ['u' => $user['id']]
        );

        // If no pending row exists yet, compute the next logical slot on the fly
        if (!$next) {
            $nextMonday = date('Y-m-d', strtotime('next monday')) . ' 08:00:00';
            return Response::json([
                'report_type'   => 'weekly',
                'scheduled_for' => $nextMonday,
                'computed'      => true,
            ]);
        }

        return Response::json($next);
    }
}
