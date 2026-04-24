<?php
declare(strict_types=1);

namespace Linalysis\Controllers;

use Linalysis\Core\{Config, Db, Request, Response};

final class HealthController
{
    public function root(Request $req): Response
    {
        return Response::json([
            'name' => Config::get('APP_NAME', 'Linalysis'),
            'status' => 'ok',
            'docs' => 'https://linalysis.net/docs/api',
        ]);
    }

    public function health(Request $req): Response
    {
        $db = 'unknown';
        try {
            Db::fetchOne('SELECT 1 AS ok');
            $db = 'ok';
        } catch (\Throwable $e) {
            $db = 'fail';
        }
        return Response::json([
            'status' => $db === 'ok' ? 'ok' : 'degraded',
            'services' => ['database' => $db, 'api' => 'ok'],
            'time' => gmdate('c'),
        ]);
    }

    public function version(Request $req): Response
    {
        return Response::json([
            'version' => trim(@file_get_contents(dirname(__DIR__, 2) . '/VERSION') ?: 'dev'),
            'php' => PHP_VERSION,
        ]);
    }
}
