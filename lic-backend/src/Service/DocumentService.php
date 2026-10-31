<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

/**
 * DocumentService — renders, stores and delivers the PDFs the office app asks
 * for (marks notifications, report cards, transcripts, receipts, tax packs).
 *
 * The hub owns rendering because the office app is serverless: it cannot run a
 * headless browser or hold a writable filesystem. Everything here is
 * deterministic and returns a public URL the app can link to and re-send.
 */
final class DocumentService
{
    /** Absolute path of the documents directory (created on demand). */
    public static function documentsDir(): string
    {
        $dir = (string) App::instance()->config('storage.documents_path', '');
        if ($dir === '') {
            // src/Service -> app/ ; keep the files outside the web root.
            $dir = dirname(__DIR__, 2) . '/storage/documents';
        }
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }

    public static function publicBaseUrl(): string
    {
        $url = (string) App::instance()->config('storage.documents_url', '');
        if ($url === '') {
            $url = rtrim((string) App::instance()->config('app.base_url', 'https://lic.jackisa.com'), '/') . '/documents';
        }
        return rtrim($url, '/');
    }

    /**
     * Render a PDF from HTML, store it under the tenant folder and register it.
     *
     * @param array<string,mixed> $meta
     * @return array{id:string,url:string,path:string,bytes:int}
     */
    public static function store(string $html, array $meta): array
    {
        $tenant = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($meta['tenant_id'] ?? 'shared')) ?: 'shared';
        $kind   = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($meta['kind'] ?? 'document')) ?: 'document';
        $title  = (string) ($meta['title'] ?? 'Jackisa Office document');

        $pdf = PdfService::fromHtml($html, [
            'title'  => $title,
            'margin' => 32,
        ]);

        $dir = self::documentsDir() . '/' . $tenant;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $name = $kind . '-' . date('Ymd-His') . '-' . substr(Ids::random(6), 0, 8) . '.pdf';
        $abs = $dir . '/' . $name;
        file_put_contents($abs, $pdf);

        $relative = $tenant . '/' . $name;
        $url = self::publicBaseUrl() . '/' . $relative;

        $id = Ids::uuid();
        try {
            App::instance()->run(
                'INSERT INTO documents (id, tenant_id, subject_type, subject_id, kind, title, storage_path, url, bytes, status, meta)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                [
                    $id,
                    $meta['tenant_id'] ?? null,
                    (string) ($meta['subject_type'] ?? 'tenant'),
                    $meta['subject_id'] ?? null,
                    $kind,
                    $title,
                    $relative,
                    $url,
                    strlen($pdf),
                    'ready',
                    isset($meta['meta']) ? json_encode($meta['meta']) : null,
                ]
            );
        } catch (\Throwable $e) {
            App::instance()->log('warn', 'document registry insert failed', ['error' => $e->getMessage()]);
        }

        return ['id' => $id, 'url' => $url, 'path' => $abs, 'bytes' => strlen($pdf)];
    }

    /** Build the HTML for a single-assessment marks notice. @param array<string,mixed> $p */
    public static function marksHtml(array $p): string
    {
        $school = self::esc((string) ($p['company_name'] ?? 'Jackisa Office'));
        $student = self::esc((string) ($p['student']['name'] ?? 'Student'));
        $module = self::esc((string) ($p['module']['name'] ?? 'Module'));
        $kind = strtolower((string) ($p['assessment']['kind'] ?? 'assessment'));
        $dayLabel = $kind === 'exam' ? 'Final exam' : ('Day ' . (string) ($p['assessment']['day_number'] ?? '—'));
        $title = self::esc((string) ($p['assessment']['title'] ?? $dayLabel));
        $marks = (string) ($p['assessment']['marks_obtained'] ?? '—');
        $max = (string) ($p['assessment']['max_marks'] ?? '—');
        $pct = isset($p['assessment']['percentage']) ? number_format((float) $p['assessment']['percentage'], 1) . '%' : '—';
        $grade = self::esc((string) ($p['assessment']['grade'] ?? '—'));
        $standing = $p['standing'] ?? [];
        $avg = isset($standing['average']) ? number_format((float) $standing['average'], 1) . '%' : '—';
        $points = (string) ($standing['points'] ?? '—');
        $missed = (string) ($standing['missed_days'] ?? '—');
        $balance = isset($standing['balance']) ? 'UGX ' . number_format((float) $standing['balance']) : '—';
        $trend = self::esc((string) ($standing['trend'] ?? 'steady'));

        return self::shell($school, $p, <<<HTML
        <h2 class="doc-title">Assessment Result</h2>
        <p class="lead">A new mark has been recorded for <strong>{$student}</strong>.</p>
        <table class="grid">
          <tr><th>Student</th><td>{$student}</td></tr>
          <tr><th>Module</th><td>{$module}</td></tr>
          <tr><th>Assessment</th><td>{$title} ({$dayLabel})</td></tr>
          <tr><th>Score</th><td><strong>{$marks} / {$max}</strong> &nbsp;({$pct})</td></tr>
          <tr><th>Grade</th><td>{$grade}</td></tr>
          <tr><th>Running average</th><td>{$avg}</td></tr>
          <tr><th>Points</th><td>{$points}</td></tr>
          <tr><th>Days missed</th><td>{$missed}</td></tr>
          <tr><th>Fee balance</th><td>{$balance}</td></tr>
          <tr><th>Trend</th><td>{$trend}</td></tr>
        </table>
        <p class="foot">This notice is generated automatically by {$school}. Keep it for your records.</p>
        HTML);
    }

    /** Build the HTML for a full report card / transcript. @param array<string,mixed> $p */
    public static function transcriptHtml(array $p): string
    {
        $school = self::esc((string) ($p['company_name'] ?? 'Jackisa Office'));
        $student = self::esc((string) ($p['student']['name'] ?? 'Student'));
        $studentNo = self::esc((string) ($p['student']['id'] ?? ''));
        $rows = '';
        foreach (($p['modules'] ?? []) as $m) {
            $name = self::esc((string) ($m['name'] ?? ''));
            $code = self::esc((string) ($m['code'] ?? ''));
            $cw = self::fmt($m['coursework'] ?? null);
            $ex = self::fmt($m['exam'] ?? null);
            $tot = self::fmt($m['total'] ?? null);
            $g = self::esc((string) ($m['grade'] ?? ''));
            $rows .= "<tr><td>{$code}</td><td>{$name}</td><td class=\"num\">{$cw}</td><td class=\"num\">{$ex}</td><td class=\"num\"><strong>{$tot}</strong></td><td class=\"num\">{$g}</td></tr>";
        }
        $summary = $p['summary'] ?? [];
        $avg = isset($summary['average']) ? number_format((float) $summary['average'], 1) . '%' : '—';
        $points = (string) ($summary['points'] ?? '—');
        $rank = (string) ($summary['rank'] ?? '—');

        return self::shell($school, $p, <<<HTML
        <h2 class="doc-title">Report Card / Transcript</h2>
        <p class="lead">Official academic record for <strong>{$student}</strong>{$studentNo}</p>
        <table class="grid">
          <thead><tr><th>Code</th><th>Module</th><th class="num">Coursework</th><th class="num">Exam</th><th class="num">Total</th><th class="num">Grade</th></tr></thead>
          <tbody>{$rows}</tbody>
        </table>
        <table class="grid summary">
          <tr><th>Overall average</th><td>{$avg}</td><th>Points</th><td>{$points}</td><th>Class rank</th><td>{$rank}</td></tr>
        </table>
        <p class="foot">Generated by {$school}. This document is issued electronically and is valid without a signature.</p>
        HTML);
    }

    private static function fmt(mixed $v): string
    {
        return $v === null || $v === '' ? '—' : self::esc((string) $v);
    }

    private static function esc(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** @param array<string,mixed> $p */
    private static function shell(string $school, array $p, string $inner): string
    {
        $logo = (string) ($p['company_logo_url'] ?? '');
        $logoTag = $logo !== '' ? '<img class="logo" src="' . self::esc($logo) . '" alt="">' : '';
        $issued = date('d M Y H:i');
        $docId = self::esc((string) ($p['document_id'] ?? strtoupper(substr(Ids::random(6), 0, 10))));

        return <<<HTML
<!doctype html><html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: bold; color: #1d4ed8; }
  .logo { max-height: 46px; }
  .doc-title { font-size: 16px; margin: 0 0 6px; }
  .lead { color: #444; margin: 0 0 16px; }
  table.grid { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.grid th, table.grid td { border: 1px solid #d4d4d8; padding: 7px 9px; text-align: left; }
  table.grid th { background: #f4f4f5; font-weight: 600; width: 38%; }
  table.grid thead th { width: auto; }
  table.grid td.num, table.grid th.num { text-align: right; }
  .summary th { width: auto; background: #f4f4f5; }
  .foot { color: #71717a; font-size: 10px; margin-top: 20px; }
  .meta { color: #a1a1aa; font-size: 9px; margin-top: 4px; }
</style></head><body>
  <div class="head">
    <div><div class="brand">{$school}</div><div class="meta">Issued {$issued} &middot; Ref {$docId}</div></div>
    {$logoTag}
  </div>
  {$inner}
</body></html>
HTML;
    }
}
