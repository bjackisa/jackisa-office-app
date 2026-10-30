<?php
declare(strict_types=1);

namespace Jackisa\Lic\Support;

use Jackisa\Lic\App;

/**
 * Database-backed fixed-window rate limiter.
 *
 * Shared across web workers (unlike APCu) so limits hold under load and across
 * PHP-FPM pools. Fails open if the table is unavailable, so a database blip
 * never locks users out of the API.
 */
final class RateLimiter
{
    public static function allow(string $bucket, int $maxHits, int $windowSeconds): bool
    {
        try {
            $app = App::instance();
            $now = time();
            $windowStart = date('Y-m-d H:i:s', $now - ($now % max(1, $windowSeconds)));
            $key = substr($bucket . ':' . $windowStart, 0, 191);

            $app->run(
                'INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)
                 ON DUPLICATE KEY UPDATE hits = hits + 1',
                [$key, $windowStart]
            );

            $row = $app->one('SELECT hits FROM rate_limits WHERE bucket = ?', [$key]);
            if ($row === null) {
                return true;
            }

            // Opportunistic cleanup of stale buckets (cheap, indexed by PK).
            if (random_int(1, 50) === 1) {
                $app->run('DELETE FROM rate_limits WHERE window_start < ?', [date('Y-m-d H:i:s', $now - 86400)]);
            }

            return (int) $row['hits'] <= $maxHits;
        } catch (\Throwable $e) {
            App::instance()->log('warn', 'RateLimiter fail-open', ['bucket' => $bucket, 'error' => $e->getMessage()]);
            return true;
        }
    }
}
