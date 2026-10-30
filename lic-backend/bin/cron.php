#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * Cron runner.
 *
 *   php bin/cron.php run <job>      run one job
 *   php bin/cron.php run-all        run every job (for a single daily cron)
 *   php bin/cron.php list           list job names
 *   php bin/cron.php help           print a crontab snippet
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Jackisa\Lic\App;
use Jackisa\Lic\Service\CronService;

$app = App::boot();
$argv = $argv ?? [];
$command = $argv[1] ?? 'help';
$arg = $argv[2] ?? '';

function out(string $msg): void { fwrite(STDOUT, $msg . PHP_EOL); }

switch ($command) {
    case 'list':
        foreach (array_keys(CronService::jobs()) as $job) {
            out($job);
        }
        break;

    case 'run':
        if ($arg === '' || !array_key_exists($arg, CronService::jobs())) {
            fwrite(STDERR, "Usage: php bin/cron.php run <job>\n");
            exit(1);
        }
        $summary = CronService::run($arg);
        out($arg . ': ' . json_encode($summary));
        break;

    case 'run-all':
        foreach (array_keys(CronService::jobs()) as $job) {
            try {
                $summary = CronService::run($job);
                out($job . ': ' . json_encode($summary));
            } catch (\Throwable $e) {
                fwrite(STDERR, $job . ' FAILED: ' . $e->getMessage() . PHP_EOL);
            }
        }
        break;

    case 'help':
    default:
        out('Jackisa License Hub cron');
        out('');
        out('Usage: php bin/cron.php <list|run <job>|run-all>');
        out('');
        out('Suggested crontab (adjust the PHP path):');
        out('  */15 * * * *  php ' . dirname(__DIR__) . '/bin/cron.php run payments.reconcile');
        out('  0 * * * *     php ' . dirname(__DIR__) . '/bin/cron.php run licenses.expire');
        out('  0 6 * * *     php ' . dirname(__DIR__) . '/bin/cron.php run trials.remind');
        out('  30 6 * * *    php ' . dirname(__DIR__) . '/bin/cron.php run trials.expire');
        out('  0 7 * * *     php ' . dirname(__DIR__) . '/bin/cron.php run reminders.renewals');
        out('  0 2 * * *     php ' . dirname(__DIR__) . '/bin/cron.php run sync.pull');
        out('  0 3 * * *     php ' . dirname(__DIR__) . '/bin/cron.php run tax.snapshot');
        out('  15 3 * * *    php ' . dirname(__DIR__) . '/bin/cron.php run fund.snapshot');
        break;
}
