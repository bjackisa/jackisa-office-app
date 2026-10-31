<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\DocumentService;
use Jackisa\Lic\Service\MailService;
use Jackisa\Lic\Service\WhatsAppService;

/**
 * /api/v1/education — the education work the office app delegates to the hub.
 *
 * The office app records marks, then calls here. This controller computes the
 * student's standing, renders a PDF, stores it and delivers it over WhatsApp
 * and email. Because the hub is a real server it can do this synchronously on
 * every mark, which the serverless app could never do.
 */
final class EducationController
{
    /**
     * POST /api/v1/education/notify-marks
     * Body: { tenant_id, student, module, assessment, standing?, recipients }
     */
    public static function notifyMarks(Request $request): void
    {
        Auth::requirePeer($request, ['office']);

        $student = self::student($request);
        if ($student['name'] === '') {
            Response::error('422', 'student.name is required', 422);
        }

        $standing = self::standing($request);
        $payload = [
            'company_name'     => $request->string('company_name', 'Jackisa Office'),
            'company_logo_url' => $request->string('company_logo_url'),
            'tenant_id'        => $request->string('tenant_id'),
            'document_id'      => $request->string('document_id'),
            'student'          => $student,
            'module'           => self::module($request),
            'assessment'       => self::assessment($request),
            'standing'         => $standing,
        ];

        $html = DocumentService::marksHtml($payload);
        $doc = DocumentService::store($html, [
            'tenant_id'    => $request->string('tenant_id'),
            'subject_type' => 'student',
            'subject_id'   => $request->string('student_id'),
            'kind'         => 'marks_notification',
            'title'        => 'Assessment result — ' . $student['name'],
            'meta'         => ['student' => $student['name'], 'assessment' => $payload['assessment']],
        ]);

        $delivery = self::deliver(
            $request,
            'marks_notification',
            'Assessment result for ' . $student['name'],
            $student['name'],
            $doc['url'],
            self::marksMessage($payload)
        );

        Response::ok(['document' => $doc, 'delivery' => $delivery, 'standing' => $standing]);
    }

    /**
     * POST /api/v1/education/transcript
     * Body: { tenant_id, student, modules[], summary?, recipients }
     */
    public static function transcript(Request $request): void
    {
        Auth::requirePeer($request, ['office']);

        $student = self::student($request);
        $modules = $request->input('modules');
        if (!is_array($modules)) {
            $modules = [];
        }
        $summary = $request->input('summary');
        if (!is_array($summary)) {
            $summary = self::summarise($modules);
        }

        $payload = [
            'company_name'     => $request->string('company_name', 'Jackisa Office'),
            'company_logo_url' => $request->string('company_logo_url'),
            'tenant_id'        => $request->string('tenant_id'),
            'document_id'      => $request->string('document_id'),
            'student'          => $student,
            'modules'          => $modules,
            'summary'          => $summary,
        ];

        $html = DocumentService::transcriptHtml($payload);
        $doc = DocumentService::store($html, [
            'tenant_id'    => $request->string('tenant_id'),
            'subject_type' => 'student',
            'subject_id'   => $request->string('student_id'),
            'kind'         => 'transcript',
            'title'        => 'Report card — ' . $student['name'],
            'meta'         => ['modules' => count($modules), 'summary' => $summary],
        ]);

        $delivery = self::deliver(
            $request,
            'transcript',
            'Report card for ' . $student['name'],
            $student['name'],
            $doc['url'],
            self::transcriptMessage($student['name'], $summary)
        );

        Response::ok(['document' => $doc, 'delivery' => $delivery, 'summary' => $summary]);
    }

    /** @return array{name:string,id:string,phone:string,email:string,guardian_phone:string,guardian_email:string} */
    private static function student(Request $request): array
    {
        $s = $request->input('student');
        $s = is_array($s) ? $s : [];
        return [
            'name'  => trim((string) ($s['name'] ?? $request->string('student_name'))),
            'id'    => (string) ($s['id'] ?? $request->string('student_id')),
            'phone' => (string) ($s['phone'] ?? ''),
            'email' => (string) ($s['email'] ?? ''),
            'guardian_phone' => (string) ($s['guardian_phone'] ?? ''),
            'guardian_email' => (string) ($s['guardian_email'] ?? ''),
        ];
    }

    /** @return array{code:string,name:string} */
    private static function module(Request $request): array
    {
        $m = $request->input('module');
        $m = is_array($m) ? $m : [];
        return [
            'code' => (string) ($m['code'] ?? ''),
            'name' => (string) ($m['name'] ?? $request->string('module_name')),
        ];
    }

    /** @return array<string,mixed> */
    private static function assessment(Request $request): array
    {
        $a = $request->input('assessment');
        $a = is_array($a) ? $a : [];
        $marks = isset($a['marks_obtained']) ? (float) $a['marks_obtained'] : null;
        $max = isset($a['max_marks']) ? (float) $a['max_marks'] : null;
        if ($marks !== null && $max !== null && $max > 0) {
            $a['percentage'] = round($marks / $max * 100, 1);
            $a['grade'] = $a['grade'] ?? self::grade($a['percentage']);
        }
        return $a;
    }

    /** @return array<string,mixed> */
    private static function standing(Request $request): array
    {
        $s = $request->input('standing');
        if (is_array($s)) {
            return $s;
        }
        // Derive a minimal standing from whatever the app could send.
        $out = [];
        $avg = $request->input('average');
        if ($avg !== null) {
            $out['average'] = round((float) $avg, 1);
        }
        foreach (['points', 'missed_days', 'balance', 'trend'] as $k) {
            $v = $request->input($k);
            if ($v !== null) {
                $out[$k] = $v;
            }
        }
        return $out;
    }

    private static function grade(float $pct): string
    {
        return match (true) {
            $pct >= 80 => 'A',
            $pct >= 70 => 'B',
            $pct >= 60 => 'C',
            $pct >= 50 => 'D',
            default    => 'E',
        };
    }

    /** @param array<int,mixed> $modules @return array{average:float,points:int,rank:string} */
    private static function summarise(array $modules): array
    {
        $totals = [];
        $points = 0;
        foreach ($modules as $m) {
            if (!is_array($m)) {
                continue;
            }
            $total = isset($m['total']) ? (float) $m['total'] : null;
            if ($total !== null) {
                $totals[] = $total;
                $points += (int) round($total / 10);
            }
        }
        $avg = $totals ? round(array_sum($totals) / count($totals), 1) : 0.0;
        return ['average' => $avg, 'points' => $points, 'rank' => '—'];
    }

    /**
     * Send the notice over WhatsApp and email, recording each attempt.
     *
     * @return array<string,mixed>
     */
    private static function deliver(Request $request, string $kind, string $subject, string $studentName, string $url, string $message): array
    {
        $recipients = $request->input('recipients');
        $recipients = is_array($recipients) ? $recipients : [];
        $phones = self::normalise($recipients['phones'] ?? []);
        $emails = self::normalise($recipients['emails'] ?? []);

        $body = $message . "\n\nOpen the PDF: " . $url;
        $wa = [];
        foreach ($phones as $phone) {
            $wa[] = ['to' => $phone] + WhatsAppService::send($phone, $body, ['template' => $kind]);
        }

        $html = '<p>' . htmlspecialchars($message, ENT_QUOTES) . '</p>'
            . '<p><a href="' . htmlspecialchars($url, ENT_QUOTES) . '">Open the PDF document</a></p>';
        $mail = [];
        foreach ($emails as $email) {
            $mail[] = ['to' => $email] + MailService::send([$email], $subject, $html, [], ['template' => $kind]);
        }

        return ['whatsapp' => $wa, 'email' => $mail, 'url' => $url];
    }

    /** @return array<int,string> */
    private static function normalise(mixed $value): array
    {
        if (is_string($value)) {
            $value = preg_split('/[,;\s]+/', $value) ?: [];
        }
        if (!is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $v) {
            $v = trim((string) $v);
            if ($v !== '') {
                $out[] = $v;
            }
        }
        return array_values(array_unique($out));
    }

    /** @param array<string,mixed> $p */
    private static function marksMessage(array $p): string
    {
        $a = $p['assessment'];
        $max = $a['max_marks'] ?? '—';
        $pct = isset($a['percentage']) ? $a['percentage'] . '%' : '—';
        return sprintf(
            "%s: new mark recorded.\nModule: %s\nScore: %s/%s (%s)\nRunning average: %s",
            $p['student']['name'],
            $p['module']['name'] ?: '—',
            $a['marks_obtained'] ?? '—',
            $max,
            $pct,
            isset($p['standing']['average']) ? $p['standing']['average'] . '%' : '—'
        );
    }

    /** @param array<string,mixed> $summary */
    private static function transcriptMessage(string $name, array $summary): string
    {
        return sprintf(
            "%s: report card is ready.\nOverall average: %s\nPoints: %s",
            $name,
            isset($summary['average']) ? $summary['average'] . '%' : '—',
            $summary['points'] ?? '—'
        );
    }
}
