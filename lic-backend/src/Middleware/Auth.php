<?php
declare(strict_types=1);

namespace Jackisa\Lic\Middleware;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Support\Crypto;

/**
 * Caller authentication for the licence/payment hub.
 *
 * Three caller classes are accepted:
 *   1. A peer service (office.jackisa.com / jackisa.com) proving itself with an
 *      HMAC signature over the raw body — the default for machine calls.
 *   2. An API key (key_id + secret) for admin/ops tooling.
 *   3. A tenant licence key, for the app's own daily licence heartbeat.
 */
final class Auth
{
    /** @var array<string,mixed>|null */
    private static ?array $caller = null;

    /**
     * Require a trusted peer signature (used by /sync and internal endpoints).
     * @param array<int,string> $peers
     */
    public static function requirePeer(Request $request, array $peers = ['office', 'jackisa']): void
    {
        $signature = $request->header('X-Lic-Signature');
        $peerName = $request->header('X-Lic-Peer', '');
        $raw = self::rawBody();

        $candidates = $peerName !== '' ? array_intersect([$peerName], $peers) : $peers;
        foreach ($candidates as $peer) {
            if (Crypto::verifyPeer($peer, $raw, $signature)) {
                self::$caller = ['type' => 'peer', 'peer' => $peer];
                return;
            }
        }

        self::logDenied($request, 'peer signature invalid');
        Response::error('401', 'Invalid or missing peer signature', 401);
    }

    /**
     * Require an API key. Header: X-Api-Key: <key_id>, X-Api-Secret: <secret>.
     */
    public static function requireApiKey(Request $request): void
    {
        $keyId = $request->header('X-Api-Key');
        $secret = $request->header('X-Api-Secret');
        if (!$keyId || !$secret) {
            self::logDenied($request, 'api key missing');
            Response::error('401', 'API credentials required', 401);
        }

        $row = App::instance()->one(
            'SELECT * FROM api_keys WHERE key_id = ? AND is_active = 1 LIMIT 1',
            [$keyId]
        );
        if ($row === null || !password_verify($secret, (string) $row['secret_hash'])) {
            self::logDenied($request, 'api key invalid');
            Response::error('401', 'Invalid API credentials', 401);
        }

        App::instance()->run('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [$row['id']]);
        self::$caller = ['type' => 'api_key', 'id' => $row['id'], 'name' => $row['name']];
    }

    /** @return array<string,mixed>|null */
    public static function caller(): ?array
    {
        return self::$caller;
    }

    private static function rawBody(): string
    {
        static $raw = null;
        if ($raw === null) {
            $raw = file_get_contents('php://input') ?: '';
        }
        return $raw;
    }

    private static function logDenied(Request $request, string $reason): void
    {
        App::instance()->log('security', 'auth denied', [
            'reason' => $reason,
            'ip' => $request->ip(),
            'path' => $request->path(),
            'ua' => $request->userAgent(),
        ]);
    }
}
