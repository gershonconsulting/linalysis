<?php
declare(strict_types=1);

/**
 * One-shot CSV backfill.
 *
 * Usage: php bin/import_csv.php <email> <path-to-linalysis.csv>
 *
 * Expected headers (matches the Chrome extension export):
 *   Date,Connections,Search Appearance,Views,Invitations,SSI Industry,SSI Network,SSI,
 *   Company Followers,Company Search Appearances,Company Unique Visitors,
 *   Company New Followers,Company Post Impressions,Company Custom Clicks,
 *   Company Credits Available,Company Credits Total
 */

use Linalysis\Core\Db;

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
if (file_exists($root . '/.env')) {
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

$email = $argv[1] ?? null;
$path  = $argv[2] ?? null;
if (!$email || !$path) {
    fwrite(STDERR, "Usage: php bin/import_csv.php <email> <csv>\n");
    exit(1);
}
if (!is_readable($path)) { fwrite(STDERR, "File not readable: $path\n"); exit(1); }

$user = Db::fetchOne('SELECT id FROM users WHERE email = :e', ['e' => strtolower(trim($email))]);
if (!$user) { fwrite(STDERR, "User not found: $email — run seed.sql first\n"); exit(1); }
$userId = (int) $user['id'];

$fh = fopen($path, 'r');
$header = fgetcsv($fh);
$map = [
    'Date' => 'captured_at', 'Connections' => 'connections', 'Search Appearance' => 'search_appearances',
    'Views' => 'profile_views', 'Invitations' => 'invitations', 'SSI Industry' => 'ssi_industry_rank',
    'SSI Network' => 'ssi_network_rank', 'SSI' => 'ssi_overall',
    'Company Followers' => 'company_followers', 'Company Search Appearances' => 'company_search_appearances',
    'Company Unique Visitors' => 'company_unique_visitors', 'Company New Followers' => 'company_new_followers',
    'Company Post Impressions' => 'company_post_impressions', 'Company Custom Clicks' => 'company_custom_clicks',
    'Company Credits Available' => 'company_credits_available', 'Company Credits Total' => 'company_credits_total',
];
$columns = [];
foreach ($header as $h) $columns[] = $map[$h] ?? null;

$ok = 0; $skip = 0;
Db::conn()->beginTransaction();
while (($row = fgetcsv($fh)) !== false) {
    $data = ['user_id' => $userId];
    foreach ($row as $i => $v) {
        $col = $columns[$i] ?? null;
        if (!$col) continue;
        $data[$col] = $v === '' ? null : $v;
    }
    if (empty($data['captured_at'])) { $skip++; continue; }
    $cols = array_keys($data);
    $ph = array_map(fn($c) => ":$c", $cols);
    $upd = array_map(fn($c) => "$c = VALUES($c)", array_diff($cols, ['user_id', 'captured_at']));
    $sql = 'INSERT INTO linkedin_stats (' . implode(',', $cols) . ')
            VALUES (' . implode(',', $ph) . ')
            ON DUPLICATE KEY UPDATE ' . implode(', ', $upd);
    Db::execute($sql, $data);
    $ok++;
}
Db::conn()->commit();
fclose($fh);
echo "Imported: ok=$ok skipped=$skip\n";
