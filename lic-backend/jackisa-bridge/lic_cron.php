<?php
/**
 * lic_cron.php — deployed to jackisa.com/public_html/lic_cron.php
 *
 * Bridge that lets the single hPanel cron job drive the Jackisa License Hub
 * jobs on lic.jackisa.com. It shells out to the hub's own CLI runner so the hub
 * keeps its per-job bookkeeping, locks and cron_runs rows.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

$hub = '/home/u388105230/domains/lic.jackisa.com/app';
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($hub . '/bin/cron.php') . ' run-all 2>&1';
$out = [];
exec($cmd, $out, $code);
echo implode("\n", $out) . "\n";
exit($code);
