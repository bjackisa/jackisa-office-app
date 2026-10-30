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
     */
    public static function verifyPeer(string $peer, string $rawBody, ?string $signatureHeader): bool
    {
        if (!$signatureHeader) {
            return false;
        }
        $secret = (string) App::instance()->config(['peers', $peer, 'shared_secret'], '');
        if ($secret === '') {
            return false;
        }
        $provided = preg_replace('/^sha256=/i', '', trim($signatureHeader));
        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $provided ?? '');
    }

    public static function peerSignature(string $peer, string $rawBody): string
    {
        $secret = (string) App::instance()->config(['peers', $peer, 'shared_secret'], '');
        return 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    }
}
