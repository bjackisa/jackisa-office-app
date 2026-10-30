<?php
declare(strict_types=1);

/**
 * PSR-4-ish autoloader for the Jackisa\Lic namespace, so the app runs on
 * plain shared hosting without composer.
 */
spl_autoload_register(static function (string $class): void {
    $prefix = 'Jackisa\\Lic\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

require_once __DIR__ . '/App.php';
require_once __DIR__ . '/Http/Response.php';
