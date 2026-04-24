<?php
declare(strict_types=1);

/**
 * One-shot schema installer. Safe to re-run (all CREATE TABLE use IF NOT EXISTS).
 *
 * Usage (local):   php bin/migrate.php
 * Usage (hosted):  php /home/u000000000/public_html/api/bin/migrate.php
 */

use Linalysis\Core\{Config, Db};

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
if (file_exists($root . '/.env')) {
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

$sql = file_get_contents($root . '/sql/schema.sql');
if (!$sql) { fwrite(STDERR, "Could not read sql/schema.sql\n"); exit(1); }

$statements = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
$ok = 0; $skip = 0; $fail = 0;
foreach ($statements as $stmt) {
    if ($stmt === '' || str_starts_with(ltrim($stmt), '--') || preg_match('/^SET\s/i', $stmt)) { $skip++; continue; }
    try {
        Db::conn()->exec($stmt);
        $ok++;
    } catch (\Throwable $e) {
        fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n  " . substr($stmt, 0, 120) . "...\n");
        $fail++;
    }
}
echo "Migrated: ok=$ok skipped=$skip failed=$fail\n";
exit($fail > 0 ? 1 : 0);
