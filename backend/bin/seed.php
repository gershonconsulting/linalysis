<?php
declare(strict_types=1);

/**
 * Loads sql/seed.sql. Run after migrate.php on a fresh DB.
 */

use Linalysis\Core\Db;

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';
if (file_exists($root . '/.env')) {
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

$sql = file_get_contents($root . '/sql/seed.sql');
$statements = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
$ok = 0; $fail = 0;
foreach ($statements as $stmt) {
    if ($stmt === '' || str_starts_with(ltrim($stmt), '--')) continue;
    try { Db::conn()->exec($stmt); $ok++; }
    catch (\Throwable $e) { fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n"); $fail++; }
}
echo "Seeded: ok=$ok failed=$fail\n";
exit($fail > 0 ? 1 : 0);
