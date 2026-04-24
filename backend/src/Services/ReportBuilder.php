<?php
declare(strict_types=1);

namespace Linalysis\Services;

use Linalysis\Core\Db;

/**
 * Builds an HTML email for a weekly or monthly digest.
 * Queries linkedin_stats for the period + prior period, computes deltas,
 * renders a simple brand-consistent HTML block.
 */
final class ReportBuilder
{
    public function buildWeekly(int $userId): ?array
    {
        return $this->build($userId, 7, 'week');
    }

    public function buildMonthly(int $userId): ?array
    {
        return $this->build($userId, 30, 'month');
    }

    private function build(int $userId, int $days, string $label): ?array
    {
        $latest = Db::fetchOne(
            "SELECT * FROM linkedin_stats WHERE user_id = :u ORDER BY captured_at DESC LIMIT 1",
            ['u' => $userId]
        );
        if (!$latest) return null;

        $prior = Db::fetchOne(
            "SELECT * FROM linkedin_stats WHERE user_id = :u AND captured_at <= DATE_SUB(:d, INTERVAL :n DAY)
             ORDER BY captured_at DESC LIMIT 1",
            ['u' => $userId, 'd' => $latest['captured_at'], 'n' => $days]
        );

        $user = Db::fetchOne("SELECT email, full_name FROM users WHERE id = :u", ['u' => $userId]);
        $name = $user['full_name'] ?: explode('@', $user['email'])[0];

        $deltaRow = function(string $label, string $key, array $latest, ?array $prior) {
            $curr = (int) ($latest[$key] ?? 0);
            $prev = (int) ($prior[$key] ?? 0);
            $delta = $curr - $prev;
            $arrow = $delta > 0 ? '▲' : ($delta < 0 ? '▼' : '—');
            $color = $delta > 0 ? '#057642' : ($delta < 0 ? '#cc1016' : '#6e6e73');
            return "<tr>
                <td style=\"padding:8px 12px\">$label</td>
                <td style=\"padding:8px 12px;text-align:right;font-variant-numeric:tabular-nums\"><strong>" . number_format($curr) . "</strong></td>
                <td style=\"padding:8px 12px;text-align:right;color:$color;font-variant-numeric:tabular-nums\">$arrow " . number_format(abs($delta)) . "</td>
            </tr>";
        };

        $rows = $deltaRow('Connections', 'connections', $latest, $prior)
              . $deltaRow('Profile views', 'profile_views', $latest, $prior)
              . $deltaRow('Search appearances', 'search_appearances', $latest, $prior)
              . $deltaRow('SSI overall', 'ssi_overall', $latest, $prior)
              . $deltaRow('Company followers', 'company_followers', $latest, $prior);

        $subject = $label === 'week'
            ? "Your LinkedIn week in review — " . date('M j', strtotime($latest['captured_at']))
            : "Your LinkedIn month in review — " . date('F Y', strtotime($latest['captured_at']));

        $html = '<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;margin:0;padding:30px;background:#f5f5f7;color:#1d1d1f">
          <table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
            <tr><td style="padding:24px 30px;background:#FE1B04;color:#fff">
              <h1 style="margin:0;font-size:22px;font-weight:800">Linalysis · your ' . $label . '</h1>
              <p style="margin:6px 0 0;font-size:13px;opacity:.9">Hi ' . htmlspecialchars($name, ENT_QUOTES) . ', here\'s how your LinkedIn performed.</p>
            </td></tr>
            <tr><td style="padding:24px 30px">
              <table width="100%" style="border-collapse:collapse;font-size:14px">
                <thead><tr style="color:#6e6e73;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
                  <th style="padding:8px 12px;text-align:left">Metric</th>
                  <th style="padding:8px 12px;text-align:right">Now</th>
                  <th style="padding:8px 12px;text-align:right">Δ ' . $label . '</th>
                </tr></thead>
                <tbody>' . $rows . '</tbody>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#6e6e73">
                <a href="https://linalysis.net/dashboard.html" style="color:#FE1B04;text-decoration:none;font-weight:600">Open dashboard →</a>
              </p>
            </td></tr>
            <tr><td style="padding:18px 30px;border-top:1px solid #e5e7eb;color:#6e6e73;font-size:11px">
              © ' . date('Y') . ' Linalysis · You can <a href="https://linalysis.net/account.html" style="color:#6e6e73">change email preferences</a>.
            </td></tr>
          </table>
        </body></html>';

        return [
            'subject'      => $subject,
            'html'         => $html,
            'period_start' => $prior['captured_at'] ?? $latest['captured_at'],
            'period_end'   => $latest['captured_at'],
        ];
    }
}
