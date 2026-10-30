<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;

/**
 * WhatsApp delivery via the same Whapi.Cloud account jackisa.com uses.
 * Whapi drives a real WhatsApp account, so the body goes out verbatim.
 */
final class WhatsAppService
{
    public static function send(string $to, string $body, array $opts = []): array
    {
        $app = App::instance();
        $token = (string) $app->config('whapi.token', '');
        $base  = rtrim((string) $app->config('whapi.base_url', 'https://gate.whapi.cloud/'), '/') . '/';

        if ($token === '') {
            return self::log($to, $body, 'failed', 'WhatsApp not configured', $opts['template'] ?? null);
        }

        $recipient = ltrim(preg_replace('/\D/', '', $to) ?? '', '+');
        if (strlen($recipient) < 9) {
            return self::log($to, $body, 'failed', 'Invalid recipient', $opts['template'] ?? null);
        }

        $payload = ['to' => $recipient, 'body' => $body];
        if (!empty($opts['media'])) {
            $payload['media'] = $opts['media'];
        }

        $ch = curl_init($base . 'messages/text');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        $response = curl_exec($ch);
        $error = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            $app->log('error', 'whapi curl error', ['error' => $error]);
            return self::log($to, $body, 'failed', $error, $opts['template'] ?? null);
        }

        $decoded = json_decode((string) $response, true);
        $sent = is_array($decoded) && ($decoded['sent'] ?? false) === true;
        if ($status >= 200 && $status < 300 && $sent) {
            return self::log($to, $body, 'sent', null, $opts['template'] ?? null, (string) ($decoded['message']['id'] ?? ''));
        }
        return self::log($to, $body, 'failed', 'HTTP ' . $status . ' ' . substr((string) $response, 0, 200), $opts['template'] ?? null);
    }

    private static function log(string $to, string $body, string $status, ?string $error, ?string $template = null, ?string $providerId = null): array
    {
        try {
            App::instance()->run(
                'INSERT INTO message_log (channel, provider, to_address, template, status, provider_id, error, body_preview)
                 VALUES (?,?,?,?,?,?,?,?)',
                ['whatsapp', 'whapi', $to, $template, $status, $providerId, $error, substr($body, 0, 500)]
            );
        } catch (\Throwable $e) {
            // ignore logging failure
        }
        return ['status' => $status, 'error' => $error];
    }
}
