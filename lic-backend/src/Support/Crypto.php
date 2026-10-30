<?php
declare(strict_types=1);

namespace Jackisa\Lic\Support;

use Jackisa\Lic\App;

/**
 * Signing and verification helpers for licence certificates and peer calls.
 */
final class Crypto
{
    public static function sign(string $payload): string
    {
        $secret = (string) App::instance()->config('license.signing_secret', '');
        return hash_hmac('sha256', $payload, $secret);
    }

    public static function verify(string $payload, string $signature): bool
    {
        return hash_equals(self::sign($payload), $signature);
    }

    /** Canonical JSON: stable key order so signatures survive a round trip. */
    public static function canonicalJson(array $data): string
    {
        self::ksortRecursive($data);
        return json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    private static function ksortRecursive(array &$data): void
    {
        ksort($data);
        foreach ($data as &$value) {
            if (is_array($value)) {
                self::ksortRecursive($value);
            }
        }
    }

    /**
     * Verify a peer (jackisa.com / office) request signature.
     * Header format: X-Lic-Signature: sha256=<hex>
     *
     * A peer may declare `shared_secrets` (a list) alongside `shared_secret`
     * so a secret can be rotated without a hard cut-over: the new value is the
     * primary and older values remain accepted until they are removed.
     */
    public static function verifyPeer(string $peer, string $rawBody, ?string $signatureHeader): bool
    {
        if (!$signatureHeader) {
            return false;
        }
        $provided = preg_replace('/^sha256=/i', '', trim($signatureHeader));
        if ($provided === null || !preg_match('/^[0-9a-f]{64}$/i', $provided)) {
            return false;
        }
        foreach (self::peerSecrets($peer) as $secret) {
            if (hash_equals(hash_hmac('sha256', $rawBody, $secret), $provided)) {
                return true;
            }
        }
        return false;
    }

    public static function peerSignature(string $peer, string $rawBody): string
    {
        $secrets = self::peerSecrets($peer);
        $secret = $secrets[0] ?? '';
        return 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    }

    /** @return array<int,string> Non-empty secrets for a peer, primary first. */
    private static function peerSecrets(string $peer): array
    {
        $app = App::instance();
        $secrets = [];
        $primary = (string) $app->config(['peers', $peer, 'shared_secret'], '');
        if ($primary !== '') {
            $secrets[] = $primary;
        }
        $extra = $app->config(['peers', $peer, 'shared_secrets'], []);
        if (is_array($extra)) {
            foreach ($extra as $candidate) {
                $candidate = (string) $candidate;
                if ($candidate !== '' && !in_array($candidate, $secrets, true)) {
                    $secrets[] = $candidate;
                }
            }
        }
        return $secrets;
    }
}
