<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Crypto;
use Jackisa\Lic\Support\Ids;

/**
 * "Continue with Jackisa" — a short-lived handoff token.
 *
 * The office app sends a jackisa access token; we ask jackisa.com's bridge to
 * confirm the identity and return the profile (including the avatar, so office
 * reuses the jackisa.com profile photo). We then mint a one-time SSO token the
 * office app exchanges for its own Supabase session.
 */
final class SsoService
{
    /** @return array<string,mixed> */
    public static function verifyJackisaToken(string $accessToken): array
    {
        $app = App::instance();
        $bridge = (string) $app->config(['peers', 'jackisa', 'bridge_url'], '');

        $payload = json_encode(['access_token' => $accessToken, 'action' => 'verify']);
        $ch = curl_init($bridge);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Lic-Signature: ' . Crypto::peerSignature('jackisa', (string) $payload),
                'X-Lic-Peer: lic',
            ],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['ok' => false, 'error' => 'Jackisa is unreachable: ' . $error];
        }
        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded) || empty($decoded['ok'])) {
            return ['ok' => false, 'error' => $decoded['error'] ?? 'Jackisa rejected the token.'];
        }
        return $decoded;
    }

    /**
     * Mint a one-time SSO token for the office app.
     * @param array<string,mixed> $profile
     */
    public static function mint(array $profile): string
    {
        $app = App::instance();
        $token = Ids::random(32);
        $app->run(
            'INSERT INTO sso_tokens (id, token_hash, jackisa_user_id, email, payload, expires_at)
             VALUES (?,?,?,?,?,?)',
            [
                Ids::uuid(),
                hash('sha256', $token),
                (string) ($profile['jackisa_user_id'] ?? $profile['id'] ?? ''),
                strtolower((string) ($profile['email'] ?? '')),
                json_encode($profile, JSON_UNESCAPED_SLASHES),
                date('Y-m-d H:i:s', time() + 300),
            ]
        );
        return $token;
    }

    /** @return array<string,mixed>|null */
    public static function consume(string $token): ?array
    {
        $app = App::instance();
        $row = $app->one(
            'SELECT * FROM sso_tokens WHERE token_hash = ? AND consumed_at IS NULL LIMIT 1',
            [hash('sha256', $token)]
        );
        if ($row === null || strtotime((string) $row['expires_at']) < time()) {
            return null;
        }
        $app->run('UPDATE sso_tokens SET consumed_at = NOW() WHERE id = ?', [$row['id']]);
        $payload = json_decode((string) $row['payload'], true);
        return is_array($payload) ? $payload : null;
    }
}
