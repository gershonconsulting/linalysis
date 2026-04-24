<?php
declare(strict_types=1);

/**
 * Monthly report — runs on the 1st of every month at 08:00 UTC.
 *
 * Hostinger cron:
 *   0 8 1 * * /usr/bin/php /home/u000000000/public_html/api/cron/monthly_report.php
 */

use Linalysis\Core\Db;
use Linalysis\Services\{Mailer, ReportBuilder};

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
if (file_exists($root . '/.env')) {
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

$users = Db::fetchAll(
    "SELECT u.id, u.email, u.full_name, u.timezone
     FROM users u
     LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE u.email_verified_at IS NOT NULL AND (s.plan != 'free' OR s.plan IS NULL)"
);

$sent = 0; $failed = 0;
foreach ($users as $u) {
    $hour = (int) (new DateTime('now', new DateTimeZone($u['timezone'])))->format('H');
    if ($hour < 7 || $hour > 9) continue;

    try {
        $builder = new ReportBuilder();
        $report = $builder->buildMonthly((int) $u['id']);
        if (!$report) continue;

        $deliveryId = Db::insert(
            "INSERT INTO report_deliveries (user_id, report_type, period_start, period_end, scheduled_for, subject, status)
             VALUES (:u, 'monthly', :ps, :pe, UTC_TIMESTAMP(), :subj, 'pending')",
            ['u' => $u['id'], 'ps' => $report['period_start'], 'pe' => $report['period_end'], 'subj' => $report['subject']]
        );

        (new Mailer())->send($u['email'], $report['subject'], $report['html'], true);

        Db::execute("UPDATE report_deliveries SET status = 'sent', sent_at = UTC_TIMESTAMP() WHERE id = :id",
            ['id' => $deliveryId]);
        $sent++;
    } catch (\Throwable $e) {
        error_log("[linalysis.monthly] user {$u['id']} failed: " . $e->getMessage());
        $failed++;
    }
}

echo "Monthly report run: sent=$sent failed=$failed\n";
