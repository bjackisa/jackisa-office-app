<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\CronService;

/**
 * /api/v1/cron — run scheduled maintenance over HTTP.
 *
 * The host has no shell crontab, so the hub's periodic jobs (licence expiry,
 * trial reminders and expiry, payment reconciliation, tax/fund snapshots,
 * renewal reminders) are driven from outside by a peer that does have a
 * scheduler. Only a signed peer may call this.
 */
final class CronController
{
    /** POST /api/v1/cron/run — body: { job?: string, all?: bool } */
    public static function run(Request $request): void
    {
        Auth::requirePeer($request);

        $jobs = CronService::jobs();
        $job = $request->string('job');

        if ($job !== '') {
            if (!array_key_exists($job, $jobs)) {
                Response::error('422', 'Unknown job: ' . $job, 422);
            }
            Response::ok(['job' => $job, 'result' => CronService::run($job)]);
        }

        if ($request->bool('all', false)) {
            $results = [];
            foreach (array_keys($jobs) as $name) {
                try {
                    $results[$name] = CronService::run($name);
                } catch (\Throwable $e) {
                    $results[$name] = ['error' => $e->getMessage()];
                }
            }
            Response::ok(['jobs' => $results]);
        }

        Response::ok(['jobs' => array_keys($jobs)]);
    }
}
