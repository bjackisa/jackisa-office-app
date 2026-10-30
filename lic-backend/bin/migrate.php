#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Apply migrations/*.sql in order.
 *
 *   php bin/migrate.php            apply all pending
 *   php bin/migrate.php status     show which files have run
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Jackisa\Lic\App;

$app = App::boot();
$pdo = $app->pdo();
$dir = dirname(__DIR__) . '/migrations';

$pdo->exec('CREATE TABLE IF NOT EXISTS _migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)');

$applied = array_column($pdo->query('SELECT filename FROM _migrations')->fetchAll(), 'filename');
$files = glob($dir . '/*.sql') ?: [];
sort($files);

$command = $argv[1] ?? 'apply';

foreach ($files as $file) {
    $name = basename($file);
    $isApplied = in_array($name, $applied, true);

    if ($command === 'status') {
        echo ($isApplied ? '[x] ' : '[ ] ') . $name . PHP_EOL;
        continue;
    }

    if ($isApplied) {
        continue;
    }

    echo "Applying $name ... ";
    $sql = file_get_contents($file);
    try {
        // Split on semicolons at end of line so multi-statement files work.
        $pdo->exec($sql);
        $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
        $stmt->execute([$name]);
        echo "done\n";
    } catch (\Throwable $e) {
        echo "FAILED: " . $e->getMessage() . "\n";
        exit(1);
    }
}

if ($command !== 'status') {
    echo "Migrations up to date.\n";
}
