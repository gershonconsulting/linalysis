<?php
declare(strict_types=1);

namespace Linalysis\Core;

/**
 * Tiny router. O(n) match over registered routes — plenty fast at our scale,
 * and zero framework dependency. Swap for FastRoute later if routes balloon.
 */
final class Router
{
    /** @var array<int, array{method:string, path:string, handler:array{0:class-string,1:string}}> */
    private array $routes = [];

    public function get(string $path, array $handler): void    { $this->add('GET',    $path, $handler); }
    public function post(string $path, array $handler): void   { $this->add('POST',   $path, $handler); }
    public function put(string $path, array $handler): void    { $this->add('PUT',    $path, $handler); }
    public function patch(string $path, array $handler): void  { $this->add('PATCH',  $path, $handler); }
    public function delete(string $path, array $handler): void { $this->add('DELETE', $path, $handler); }

    private function add(string $method, string $path, array $handler): void
    {
        $this->routes[] = ['method' => $method, 'path' => $path, 'handler' => $handler];
    }

    public function dispatch(Request $req): Response
    {
        foreach ($this->routes as $r) {
            if ($r['method'] === $req->method && $r['path'] === $req->path) {
                [$class, $method] = $r['handler'];
                $instance = new $class();
                $result = $instance->$method($req);
                return $result instanceof Response ? $result : Response::json($result);
            }
        }
        return Response::error('not_found', "No route: {$req->method} {$req->path}", 404);
    }
}
