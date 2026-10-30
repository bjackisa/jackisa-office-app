<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

/**
 * OTP codes are generated and approved here, on the PHP side.
 * Codes are stored hashed and compared in constant time.
 */
final class OtpService
{
    public static function issue(string $identifier, string $purpose = 'login', string $channel = 'email', int $ttlSeconds = 600): array
    {
        $app = App::instance();
        $identifier = strtolower(trim($identifier));
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $app->run(
            'INSERT INTO otp_codes (id, purpose, identifier, channel, code_hash, expires_at, ip_address)
             VALUES (?,?,?,?,?,?,?)',
            [
                Ids::uuid(), $purpose, $identifier, $channel,
                password_hash($code, PASSWORD_DEFAULT),
                date('Y-m-d H:i:s', time() + $ttlSeconds),
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]
        );

        // Deliver on the requested channel.
        if ($channel === 'whatsapp') {
            WhatsAppService::send($identifier, "Your Jackisa Office verification code is $code. It expires in " . intdiv($ttlSeconds, 60) . " minutes.", ['template' => 'otp']);
        } elseif ($channel === 'sms') {
            // SMS is not wired to a provider here; email fallback keeps flows alive.
            MailService::send([$identifier], 'Your Jackisa Office code',
                '<p>Your verification code is <strong style="font-size:20px;">' . $code . '</strong>. It expires shortly.</p>',
                [], ['template' => 'otp']);
        } else {
            MailService::send([$identifier], 'Your Jackisa Office verification code',
                '<p>Hello,</p><p>Your verification code is:</p>'
                . '<p style="font-size:26px;font-weight:bold;letter-spacing:4px;">' . $code . '</p>'
                . '<p>This code expires in ' . intdiv($ttlSeconds, 60) . ' minutes. If you did not request it, ignore this email.</p>',
                [], ['template' => 'otp']);
        }

        return ['issued' => true, 'identifier' => $identifier, 'channel' => $channel, 'expires_in' => $ttlSeconds];
    }

    public static function verify(string $identifier, string $code, string $purpose = 'login'): array
    {
        $app = App::instance();
        $identifier = strtolower(trim($identifier));

        $row = $app->one(
            'SELECT * FROM otp_codes WHERE identifier = ? AND purpose = ? AND consumed_at IS NULL
             ORDER BY created_at DESC LIMIT 1',
            [$identifier, $purpose]
        );
        if ($row === null) {
            return ['valid' => false, 'reason' => 'not_found'];
        }
        if (strtotime((string) $row['expires_at']) < time()) {
            return ['valid' => false, 'reason' => 'expired'];
        }
        if ((int) $row['attempts'] >= (int) $row['max_attempts']) {
            return ['valid' => false, 'reason' => 'too_many_attempts'];
        }

        if (!password_verify($code, (string) $row['code_hash'])) {
            $app->run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            return ['valid' => false, 'reason' => 'mismatch'];
        }

        $app->run('UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?', [$row['id']]);
        return ['valid' => true, 'identifier' => $identifier];
    }
}
