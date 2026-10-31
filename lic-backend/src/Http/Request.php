<?php
declare(strict_types=1);

namespace Jackisa\Lic\Http;

/**
 * Wrapper over the current PHP request.
 */
final class Request
{
    /** @var array<string,mixed> */
    private array $query;
    /** @var array<string,mixed> */
    private array $body;
    /** @var array<string,string> */
    private array $headers;
    private string $method;
    private string $path;

    public function __construct(
        string $method,
        string $path,
        array $query = [],
        array $body = [],
        array $headers = []
    ) {
        $this->method  = strtoupper($method);
        $this->path    = $path;
        $this->query   = $query;
        $this->body    = $body;
        $this->headers = $headers;
    }

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri    = $_SERVER['REQUEST_URI'] ?? '/';
        $path   = parse_url($uri, PHP_URL_PATH) ?: '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$name] = (string) $value;
            } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true)) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', $key))));
                $headers[$name] = (string) $value;
            }
        }

        $raw = file_get_contents('php://input') ?: '';
        $body = $_POST;
        $contentType = $headers['Content-Type'] ?? '';
        if ($raw !== '' && (str_contains($contentType, 'application/json') || $raw[0] === '{' || $raw[0] === '[')) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = array_merge($body, $decoded);
            }
        }

        return new self($method, $path, $_GET, $body, $headers);
    }

    public function method(): string { return $this->method; }
    public function path(): string { return $this->path; }

    public function header(string $name, ?string $default = null): ?string
    {
        foreach ($this->headers as $key => $value) {
            if (strcasecmp($key, $name) === 0) {
                return $value;
            }
        }
        return $default;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('Authorization');
        if ($auth && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    /** @return array<string,mixed> */
    public function all(): array
    {
        return array_merge($this->query, $this->body);
    }

    public function string(string $key, string $default = ''): string
    {
        $value = $this->input($key, $default);
        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function int(string $key, int $default = 0): int
    {
        $value = $this->input($key, $default);
        return is_numeric($value) ? (int) $value : $default;
    }

    public function float(string $key, float $default = 0.0): float
    {
        $value = $this->input($key, $default);
        return is_numeric($value) ? (float) $value : $default;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->input($key, $default);
        if (is_bool($value)) {
            return $value;
        }
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /** @return array<string,mixed> */
    public function array(string $key, array $default = []): array
    {
        $value = $this->input($key, $default);
        return is_array($value) ? $value : $default;
    }

    public function ip(): string
    {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
            $value = $_SERVER[$key] ?? '';
            if ($value !== '') {
                $first = trim(explode(',', (string) $value)[0]);
                if (filter_var($first, FILTER_VALIDATE_IP)) {
                    return $first;
                }
            }
        }
        return '0.0.0.0';
    }

    public function userAgent(): string
    {
        return substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    }
}
