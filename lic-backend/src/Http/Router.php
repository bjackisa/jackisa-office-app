<?php
declare(strict_types=1);

namespace Jackisa\Lic\Http;

/**
 * Minimal path router. Patterns use {name} placeholders.
 */
final class Router
{
    /** @var array<int,array{method:string,regex:string,params:array<int,string>,handler:callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $params = [];
        $regex = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', function ($m) use (&$params) {
            $params[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'params'  => $params,
            'handler' => $handler,
        ];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }
    public function any(string $p, callable $h): void
    {
        $this->add('GET', $p, $h);
        $this->add('POST', $p, $h);
    }

    public function dispatch(Request $request): void
    {
        $path = $request->path();
        $method = $request->method();

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (preg_match($route['regex'], $path, $matches)) {
                array_shift($matches);
                $args = array_combine($route['params'], $matches) ?: [];
                ($route['handler'])($request, $args);
                return;
            }
        }

        Response::error('404', 'Endpoint not found: ' . $method . ' ' . $path, 404);
    }
}
