<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;

/**
 * Lifecycle notifications for licence events.
 *
 * Every plan change, trial start/reminder/cancel and settled payment must reach
 * the customer on both channels — email (same SMTP as jackisa.com) and WhatsApp
 * (same Whapi.Cloud account). Two rules make that reliable:
 *
 *   1. Both channels are attempted independently, so a bounced email never
 *      suppresses the WhatsApp copy and vice versa.
 *   2. Each (dedupe_key, channel) is claimed in the `notifications` table before
 *      sending, so a retried request or a twice-run cron can never double-send.
 */
final class NotificationService
{
    /**
     * Send one event on both channels.
     *
     * @param string $dedupeKey stable id for this event+recipient (idempotency)
     * @param array<int,string> $emails
     * @param array{subject?:string,html?:string,text?:string,whatsapp?:string,template?:string,tenant_id?:string} $opts
     * @return array{email:string,whatsapp:string}
     */
    public static function dispatch(string $event, string $dedupeKey, array $emails, array $opts = []): array
    {
        $emails = array_values(array_filter(array_map('trim', $emails), fn ($e) => $e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)));
        $whatsapp = trim((string) ($opts['whatsapp'] ?? ''));
        $subject = (string) ($opts['subject'] ?? 'Jackisa Office');
        $html = (string) ($opts['html'] ?? '');
        $text = (string) ($opts['text'] ?? '');
        $template = $opts['template'] ?? null;
        $tenantId = $opts['tenant_id'] ?? null;

        $result = ['email' => 'skipped', 'whatsapp' => 'skipped'];

        if ($emails && $html !== '') {
            if (self::claim($dedupeKey . ':email', $tenantId, $event, 'email', $emails[0], $subject)) {
                try {
                    $r = MailService::send($emails, $subject, $html, [], ['template' => $template]);
                    $result['email'] = $r['status'] ?? 'failed';
                    self::mark($dedupeKey . ':email', $result['email'], $r['error'] ?? null);
                } catch (\Throwable $e) {
                    $result['email'] = 'failed';
                    self::mark($dedupeKey . ':email', 'failed', $e->getMessage());
                }
            } else {
                $result['email'] = 'already_sent';
            }
        }

        if ($whatsapp !== '' && ($text !== '' || $html !== '')) {
            $body = $text !== '' ? $text : self::toText($html);
            if (self::claim($dedupeKey . ':whatsapp', $tenantId, $event, 'whatsapp', $whatsapp, $subject)) {
                try {
                    $r = WhatsAppService::send($whatsapp, $body, ['template' => $template]);
                    $result['whatsapp'] = $r['status'] ?? 'failed';
                    self::mark($dedupeKey . ':whatsapp', $result['whatsapp'], $r['error'] ?? null);
                } catch (\Throwable $e) {
                    $result['whatsapp'] = 'failed';
                    self::mark($dedupeKey . ':whatsapp', 'failed', $e->getMessage());
                }
            } else {
                $result['whatsapp'] = 'already_sent';
            }
        }

        return $result;
    }

    /** Contact details for a tenant's owner (email + WhatsApp number). */
    public static function ownerContact(string $tenantId): array
    {
        $app = App::instance();
        $row = $app->one(
            "SELECT COALESCE(u.email, t.email) AS email,
                    COALESCE(u.phone, t.phone)  AS phone
             FROM tenants t
             LEFT JOIN tenant_members m ON m.tenant_id = t.id AND m.is_owner = 1
             LEFT JOIN users u ON u.id = m.user_id
             WHERE t.id = ? LIMIT 1",
            [$tenantId]
        );
        if ($row === null) {
            $t = $app->one('SELECT name, email, phone FROM tenants WHERE id = ?', [$tenantId]);
            return ['email' => $t['email'] ?? null, 'phone' => $t['phone'] ?? null, 'name' => $t['name'] ?? null];
        }
        $name = $app->one(
            'SELECT COALESCE(u.full_name, t.name) AS name FROM tenants t
             LEFT JOIN tenant_members m ON m.tenant_id = t.id AND m.is_owner = 1
             LEFT JOIN users u ON u.id = m.user_id WHERE t.id = ? LIMIT 1',
            [$tenantId]
        );
        return ['email' => $row['email'] ?? null, 'phone' => $row['phone'] ?? null, 'name' => $name['name'] ?? null];
    }

    /** Claim a (dedupe_key, channel) slot. Returns false when already sent. */
    private static function claim(string $dedupeKey, ?string $tenantId, string $event, string $channel, ?string $to, ?string $subject): bool
    {
        $app = App::instance();
        try {
            $app->run(
                'INSERT INTO notifications (id, tenant_id, event, dedupe_key, channel, to_address, subject, status)
                 VALUES (?,?,?,?,?,?,?,?)',
                [\Jackisa\Lic\Support\Ids::uuid(), $tenantId ?: null, $event, $dedupeKey, $channel, $to, $subject, 'sent']
            );
            return true;
        } catch (\Throwable $e) {
            // Row exists. Re-claim only when the previous attempt failed, so a
            // transient SMTP/WhatsApp error is retried but a sent message is not
            // sent twice.
            $existing = $app->one('SELECT status FROM notifications WHERE dedupe_key = ? AND channel = ?', [$dedupeKey, $channel]);
            if ($existing !== null && $existing['status'] === 'failed') {
                $app->run('UPDATE notifications SET status = ?, error = NULL WHERE dedupe_key = ? AND channel = ?', ['sent', $dedupeKey, $channel]);
                return true;
            }
            return false;
        }
    }

    private static function mark(string $dedupeKey, string $status, ?string $error): void
    {
        try {
            App::instance()->run(
                'UPDATE notifications SET status = ?, error = ? WHERE dedupe_key = ?',
                [$status === 'sent' ? 'sent' : 'failed', $error ? substr($error, 0, 500) : null, $dedupeKey]
            );
        } catch (\Throwable $e) {
            // best effort
        }
    }

    /** Flatten HTML into a readable WhatsApp body. */
    private static function toText(string $html): string
    {
        $t = preg_replace('#<(br|/p|/div|/h[1-6]|/li|/tr)[^>]*>#i', "\n", $html) ?? $html;
        $t = strip_tags($t);
        $t = html_entity_decode($t, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $t = preg_replace('/[ \t]+/', ' ', $t) ?? $t;
        $t = preg_replace('/\n{3,}/', "\n\n", $t) ?? $t;
        return trim($t);
    }
}
