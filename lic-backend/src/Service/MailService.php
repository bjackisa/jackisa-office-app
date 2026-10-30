<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;

/**
 * Transactional email over the same SMTP account jackisa.com uses.
 *
 * Uses raw SMTP over a stream so it works on shared hosting without a
 * composer dependency. Supports implicit TLS (465) and STARTTLS (587).
 */
final class MailService
{
    /** @param array<int,string> $to @param array<int,string> $cc */
    public static function send(array $to, string $subject, string $html, array $cc = [], array $opts = []): array
    {
        $app = App::instance();
        $host = (string) $app->config('mail.host', '');
        $port = (int) $app->config('mail.port', 465);
        $user = (string) $app->config('mail.username', '');
        $pass = (string) $app->config('mail.password', '');
        $enc  = strtolower((string) $app->config('mail.encryption', 'ssl'));
        $from = (string) $app->config('mail.from_email', $user);
        $fromName = (string) $app->config('mail.from_name', 'Jackisa Office');

        $to = array_values(array_filter(array_map('trim', $to)));
        if (!$to || $from === '') {
            return self::log($to, $subject, 'failed', 'Mail not configured');
        }

        $body = $opts['html']
            ? $html
            : self::wrap($subject, $html);

        try {
            $attachment = $opts['attachment'] ?? null;
            self::smtpSend($host, $port, $enc, $user, $pass, $from, $fromName, $to, $cc, $subject, $body, $attachment);
            return self::log($to, $subject, 'sent', null, $opts['template'] ?? null);
        } catch (\Throwable $e) {
            $app->log('error', 'mail send failed', ['error' => $e->getMessage(), 'to' => $to]);
            return self::log($to, $subject, 'failed', $e->getMessage(), $opts['template'] ?? null);
        }
    }

    private static function smtpSend(
        string $host, int $port, string $enc, string $user, string $pass,
        string $from, string $fromName, array $to, array $cc, string $subject, string $body,
        ?array $attachment = null
    ): void {
        $transport = $enc === 'ssl' ? 'ssl://' : '';
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $fp = @stream_socket_client($transport . $host . ':' . $port, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            throw new \RuntimeException("SMTP connect failed: $errstr ($errno)");
        }
        stream_set_timeout($fp, 20);

        $read = function () use ($fp): string {
            $data = '';
            while ($line = fgets($fp, 515)) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') {
                    break;
                }
            }
            return $data;
        };
        $cmd = function (string $command, array $expect) use ($fp, $read): string {
            fwrite($fp, $command . "\r\n");
            $resp = $read();
            $code = (int) substr($resp, 0, 3);
            if ($expect && !in_array($code, $expect, true)) {
                throw new \RuntimeException('SMTP unexpected reply: ' . trim($resp));
            }
            return $resp;
        };

        $read();
        $cmd('EHLO lic.jackisa.com', [250]);

        if ($enc === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new \RuntimeException('STARTTLS negotiation failed');
            }
            $cmd('EHLO lic.jackisa.com', [250]);
        }

        if ($user !== '') {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode($user), [334]);
            $cmd(base64_encode($pass), [235]);
        }

        $cmd('MAIL FROM:<' . $from . '>', [250]);
        foreach (array_merge($to, $cc) as $recipient) {
            $cmd('RCPT TO:<' . $recipient . '>', [250, 251]);
        }
        $cmd('DATA', [354]);

        $headers = [
            'From: ' . self::encodeName($fromName) . ' <' . $from . '>',
            'To: ' . implode(', ', $to),
            'Subject: ' . self::encodeHeader($subject),
            'MIME-Version: 1.0',
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@lic.jackisa.com>',
        ];
        if ($cc) {
            $headers[] = 'Cc: ' . implode(', ', $cc);
        }

        if ($attachment && !empty($attachment['data'])) {
            $boundary = 'jackisa_' . bin2hex(random_bytes(12));
            $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
            $filename = (string) ($attachment['filename'] ?? 'attachment.pdf');
            $mime = (string) ($attachment['mime'] ?? 'application/octet-stream');
            $payload = implode("\r\n", $headers) . "\r\n\r\n"
                . "--$boundary\r\n"
                . "Content-Type: text/html; charset=UTF-8\r\n"
                . "Content-Transfer-Encoding: base64\r\n\r\n"
                . chunk_split(base64_encode($body), 76, "\r\n")
                . "--$boundary\r\n"
                . 'Content-Type: ' . $mime . '; name="' . $filename . "\"\r\n"
                . "Content-Transfer-Encoding: base64\r\n"
                . 'Content-Disposition: attachment; filename="' . $filename . "\"\r\n\r\n"
                . chunk_split(base64_encode((string) $attachment['data']), 76, "\r\n")
                . "--$boundary--\r\n";
        } else {
            $headers[] = 'Content-Type: text/html; charset=UTF-8';
            $headers[] = 'Content-Transfer-Encoding: base64';
            $payload = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
        }
        $payload = preg_replace('/^\./m', '..', $payload);
        fwrite($fp, $payload . "\r\n.\r\n");
        $resp = $read();
        if ((int) substr($resp, 0, 3) !== 250) {
            throw new \RuntimeException('SMTP message rejected: ' . trim($resp));
        }
        $cmd('QUIT', []);
        fclose($fp);
    }

    private static function encodeName(string $name): string
    {
        return preg_match('/[^\x20-\x7e]/', $name) ? self::encodeHeader($name) : $name;
    }

    private static function encodeHeader(string $value): string
    {
        return preg_match('/[^\x20-\x7e]/', $value)
            ? '=?UTF-8?B?' . base64_encode($value) . '?='
            : $value;
    }

    /** Branded HTML shell matching jackisa.com's transactional style. */
    public static function wrap(string $title, string $innerHtml): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>' . htmlspecialchars($title) . '</title></head>'
            . '<body style="margin:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 0;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">'
            . '<tr><td style="background:#0d5ba3;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:bold;">Jackisa Office</td></tr>'
            . '<tr><td style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6;">' . $innerHtml . '</td></tr>'
            . '<tr><td style="padding:18px 28px;background:#f1f5f9;color:#64748b;font-size:12px;">'
            . 'Sent by Jackisa Office &middot; <a href="https://office.jackisa.com" style="color:#0d5ba3;">office.jackisa.com</a>'
            . '</td></tr></table></td></tr></table></body></html>';
    }

    private static function log(array $to, string $subject, string $status, ?string $error, ?string $template = null): array
    {
        try {
            App::instance()->run(
                'INSERT INTO message_log (channel, provider, to_address, subject, template, status, error, body_preview)
                 VALUES (?,?,?,?,?,?,?,?)',
                ['email', 'smtp', implode(',', $to), $subject, $template, $status, $error, null]
            );
        } catch (\Throwable $e) {
            // logging must not break the send
        }
        return ['status' => $status, 'error' => $error];
    }
}
