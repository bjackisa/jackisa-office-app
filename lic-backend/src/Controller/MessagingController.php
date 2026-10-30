<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\MailService;
use Jackisa\Lic\Service\OtpService;
use Jackisa\Lic\Service\WhatsAppService;

/**
 * /api/v1/mail, /api/v1/whapi, /api/v1/otp
 * The shared messaging rail the office app (and jackisa) send through.
 */
final class MessagingController
{
    /** POST /api/v1/mail/send */
    public static function mail(Request $request): void
    {
        Auth::requirePeer($request);
        $to = self::recipients($request->input('to'));
        $subject = $request->string('subject');
        $html = (string) ($request->input('html') ?? $request->input('body') ?? '');
        if (!$to || $subject === '' || $html === '') {
            Response::error('422', 'to, subject and html are required', 422);
        }
        $result = MailService::send($to, $subject, $html, self::recipients($request->input('cc')), [
            'template' => $request->string('template') ?: null,
            'html'     => $request->bool('raw', false),
        ]);
        Response::ok($result, $result['status'] === 'sent' ? '200' : '502');
    }

    /** POST /api/v1/whapi/send */
    public static function whatsapp(Request $request): void
    {
        Auth::requirePeer($request);
        $to = $request->string('to');
        $body = (string) ($request->input('body') ?? $request->input('text') ?? '');
        if ($to === '' || $body === '') {
            Response::error('422', 'to and body are required', 422);
        }
        $result = WhatsAppService::send($to, $body, [
            'template' => $request->string('template') ?: null,
            'media'    => $request->input('media'),
        ]);
        Response::ok($result, $result['status'] === 'sent' ? '200' : '502');
    }

    /** POST /api/v1/otp/issue */
    public static function otpIssue(Request $request): void
    {
        Auth::requirePeer($request);
        $identifier = $request->string('identifier');
        if ($identifier === '') {
            Response::error('422', 'identifier is required', 422);
        }
        $channel = $request->string('channel', 'email');
        if (!in_array($channel, ['email', 'sms', 'whatsapp'], true)) {
            $channel = 'email';
        }
        $result = OtpService::issue($identifier, $request->string('purpose', 'login'), $channel);
        Response::ok($result);
    }

    /** POST /api/v1/otp/verify */
    public static function otpVerify(Request $request): void
    {
        Auth::requirePeer($request);
        $result = OtpService::verify(
            $request->string('identifier'),
            $request->string('code'),
            $request->string('purpose', 'login')
        );
        Response::ok($result, $result['valid'] ? '200' : '400');
    }

    /** GET /api/v1/mail/log — recent outbound messages (ops). */
    public static function log(Request $request): void
    {
        Auth::requireApiKey($request);
        $channel = $request->string('channel');
        $sql = 'SELECT id, channel, provider, to_address, subject, template, status, provider_id, error, created_at
                FROM message_log';
        $params = [];
        if (in_array($channel, ['email', 'whatsapp'], true)) {
            $sql .= ' WHERE channel = ?';
            $params[] = $channel;
        }
        $sql .= ' ORDER BY id DESC LIMIT ' . max(1, min(200, $request->int('limit', 50)));
        Response::ok(['messages' => App::instance()->all($sql, $params)]);
    }

    /** @return array<int,string> */
    private static function recipients(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[,;]/', $value) ?: [];
        }
        if (!is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $item) {
            $item = trim((string) $item);
            if ($item !== '' && filter_var($item, FILTER_VALIDATE_EMAIL)) {
                $out[] = $item;
            }
        }
        return $out;
    }
}
