<?php
declare(strict_types=1);

namespace Jackisa\Lic;

/**
 * Application container: config, PDO, logging and error handling.
 *
 * Deliberately dependency-free so it runs on plain shared hosting.
 */
final class App
{
    private static ?App $instance = null;

    /** @var array<string,mixed> */
    private array $config;
    private ?\PDO $pdo = null;

    private function __construct(array $config)
    {
        $this->config = $config;
        date_default_timezone_set($config['app']['timezone'] ?? 'UTC');
    }

    public static function boot(?string $configPath = null): App
    {
        if (self::$instance instanceof App) {
            return self::$instance;
        }

        $root = dirname(__DIR__);
        $configPath = $configPath ?: $root . '/config/config.local.php';
        if (!is_file($configPath)) {
            $configPath = $root . '/config/config.example.php';
        }
        $config = require $configPath;
        $config = self::applyEnvOverrides($config);

        self::$instance = new self($config);

        if (PHP_SAPI === 'cli') {
            self::$instance->registerCliErrorHandler();
        } else {
            self::$instance->registerHttpErrorHandler();
        }

        return self::$instance;
    }

    public static function instance(): App
    {
        if (!self::$instance instanceof App) {
            throw new \RuntimeException('App not booted');
        }
        return self::$instance;
    }

    /** Environment variables override the config file (useful for cron). */
    private static function applyEnvOverrides(array $config): array
    {
        $map = [
            'LIC_DB_PASSWORD'      => ['db', 'password'],
            'LIC_DB_USERNAME'      => ['db', 'username'],
            'LIC_DB_DATABASE'      => ['db', 'database'],
            'LIC_DB_HOST'          => ['db', 'host'],
            'LIC_SIGNING_SECRET'   => ['license', 'signing_secret'],
            'LIC_MAIL_PASSWORD'    => ['mail', 'password'],
            'LIC_MAIL_USERNAME'    => ['mail', 'username'],
            'LIC_WHAPI_TOKEN'      => ['whapi', 'token'],
            'LIC_JPESA_KEY'        => ['jpesa', 'api_key'],
            'LIC_JACKISA_SECRET'   => ['peers', 'jackisa', 'shared_secret'],
            'LIC_OFFICE_SECRET'    => ['peers', 'office', 'shared_secret'],
            'LIC_DEBUG'            => ['app', 'debug'],
        ];
        foreach ($map as $env => [$section, $key]) {
            $value = getenv($env);
            if ($value === false || $value === '') {
                continue;
            }
            if ($env === 'LIC_DEBUG') {
                $value = filter_var($value, FILTER_VALIDATE_BOOLEAN);
            }
            $config[$section][$key] = $value;
        }
        return $config;
    }

    /** @param string|array<int,string> $path */
    public function config(string|array $path, mixed $default = null): mixed
    {
        $keys = is_array($path) ? $path : explode('.', $path);
        $value = $this->config;
        foreach ($keys as $key) {
            if (!is_array($value) || !array_key_exists($key, $value)) {
                return $default;
            }
            $value = $value[$key];
        }
        return $value;
    }

    public function pdo(): \PDO
    {
        if ($this->pdo instanceof \PDO) {
            return $this->pdo;
        }
        $db = $this->config['db'];
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'], (int) $db['port'], $db['database'], $db['charset']);
        $this->pdo = new \PDO($dsn, $db['username'], $db['password'], [
            \PDO::ATTR_ERRMODE            => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES   => false,
            \PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);
        return $this->pdo;
    }

    /** Convenience: run a prepared query and return the statement. */
    public function run(string $sql, array $params = []): \PDOStatement
    {
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function one(string $sql, array $params = []): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public function all(string $sql, array $params = []): array
    {
        return $this->run($sql, $params)->fetchAll();
    }

    public function log(string $channel, string $message, array $context = []): void
    {
        $dir = dirname(__DIR__) . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $line = sprintf("[%s] %s %s\n", date('c'), strtoupper($channel),
            $message . ($context ? ' ' . json_encode($context, JSON_UNESCAPED_SLASHES) : ''));
        @file_put_contents($dir . '/app.log', $line, FILE_APPEND | LOCK_EX);
    }

    private function registerCliErrorHandler(): void
    {
        error_reporting(E_ALL & ~E_DEPRECATED);
    }

    private function registerHttpErrorHandler(): void
    {
        error_reporting(E_ALL & ~E_DEPRECATED);
        ini_set('display_errors', '0');
        ini_set('log_errors', '1');

        set_exception_handler(function (\Throwable $e): void {
            $this->log('error', $e->getMessage(), [
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json');
            }
            $debug = (bool) $this->config('app.debug', false);
            echo json_encode([
                'api_status' => '500',
                'errors' => [
                    'error_id'   => '500',
                    'error_text' => $debug ? $e->getMessage() : 'Internal server error',
                ],
            ]);
        });
    }
}
