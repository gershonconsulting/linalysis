<?php
declare(strict_types=1);

/**
 * Linalysis API — single entry point.
 *
 * Routes every request to the appropriate controller based on method + path.
 * Designed to run on Hostinger (shared hosting, Apache + PHP 8.2) with a clean
 * migration path to AWS Lambda via Bref (same PSR-4 code, different bootstrap).
 */

use Linalysis\Core\Router;
use Linalysis\Core\Request;
use Linalysis\Core\Response;
use Linalysis\Core\Config;
use Linalysis\Core\Cors;

// --- Bootstrap -----------------------------------------------------------

// Error handling — show nothing to the client, log everything.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$root = dirname(__DIR__);

// Composer autoload
if (!file_exists($root . '/vendor/autoload.php')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Dependencies not installed. Run composer install.']);
    exit;
}
require $root . '/vendor/autoload.php';

// Load .env
if (file_exists($root . '/.env')) {
    Dotenv\Dotenv::createImmutable($root)->safeLoad();
}

// Config singleton
Config::load();

// Uncaught exception → JSON error
set_exception_handler(function (\Throwable $e): void {
    error_log('[linalysis] Uncaught: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'internal_error',
        'message' => Config::get('APP_ENV') === 'production' ? 'Something went wrong.' : $e->getMessage(),
    ]);
});

// --- Request + CORS ------------------------------------------------------

$request = Request::fromGlobals();
Cors::handle($request);  // Will exit early for OPTIONS preflight

// --- Routes --------------------------------------------------------------

$router = new Router();

// Health & version
$router->get('/', [\Linalysis\Controllers\HealthController::class, 'root']);
$router->get('/api/health', [\Linalysis\Controllers\HealthController::class, 'health']);
$router->get('/api/version', [\Linalysis\Controllers\HealthController::class, 'version']);

// Auth
$router->post('/api/auth/signup',  [\Linalysis\Controllers\AuthController::class, 'signup']);
$router->post('/api/auth/login',   [\Linalysis\Controllers\AuthController::class, 'login']);
$router->post('/api/auth/logout',  [\Linalysis\Controllers\AuthController::class, 'logout']);
$router->get ('/api/auth/me',      [\Linalysis\Controllers\AuthController::class, 'me']);
$router->post('/api/auth/forgot',  [\Linalysis\Controllers\AuthController::class, 'forgot']);
$router->post('/api/auth/reset',   [\Linalysis\Controllers\AuthController::class, 'reset']);

// Account + Subscription (replaces the 6 mocked troubleshooting checks)
$router->get('/api/account',              [\Linalysis\Controllers\AccountController::class, 'show']);
$router->get('/api/account/subscription', [\Linalysis\Controllers\AccountController::class, 'subscription']);
$router->get('/api/account/usage',        [\Linalysis\Controllers\AccountController::class, 'usage']);
$router->post('/api/account/token',       [\Linalysis\Controllers\AccountController::class, 'createToken']);

// Data endpoints — replaces embedded data.js
$router->get('/api/data/summary',     [\Linalysis\Controllers\DataController::class, 'summary']);
$router->get('/api/data/connections', [\Linalysis\Controllers\DataController::class, 'connections']);
$router->get('/api/data/ssi',         [\Linalysis\Controllers\DataController::class, 'ssi']);
$router->get('/api/data/company',     [\Linalysis\Controllers\DataController::class, 'company']);

// Extension ingestion (Bearer token auth)
$router->post('/api/ingest/linkedin', [\Linalysis\Controllers\IngestController::class, 'linkedin']);

// Stripe webhook (no auth — signature-verified)
$router->post('/api/stripe/webhook', [\Linalysis\Controllers\StripeController::class, 'webhook']);

// Reports
$router->get('/api/reports/list', [\Linalysis\Controllers\ReportController::class, 'listDeliveries']);
$router->get('/api/reports/next', [\Linalysis\Controllers\ReportController::class, 'nextScheduled']);

// --- Dispatch ------------------------------------------------------------

$response = $router->dispatch($request);
$response->send();
