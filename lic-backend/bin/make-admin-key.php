#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Mint an admin API key for the licence hub.
 *
 *   php bin/make-admin-key.php "Ops console" admin,catalog
 *
 * The secret is printed once and never stored in plain text (only its hash is
 * kept), so copy it straight into the caller's secret store. Use the key with
 * the X-Api-Key / X-Api-Secret headers against /api/v1/admin/*.
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

$app = App::boot();
$name = $argv[1] ?? 'Admin';
$scopes = isset($argv[2]) ? array_values(array_filter(array_map('trim', explode(',', $argv[2])))) : ['admin'];

$keyId = 'jk_' . Ids::random(12);
$secret = Ids::random(24);

$app->run(
    'INSERT INTO api_keys (id, name, key_id, secret_hash, scopes, is_active) VALUES (?,?,?,?,?,1)',
    [Ids::uuid(), $name, $keyId, password_hash($secret, PASSWORD_DEFAULT), json_encode($scopes)]
);

echo "API key created.\n";
echo "  name    : $name\n";
echo "  scopes  : " . implode(', ', $scopes) . "\n";
echo "  key_id  : $keyId\n";
echo "  secret  : $secret\n";
echo "\nStore the secret now — it is not recoverable.\n";
