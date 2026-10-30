<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;

/**
 * HTML -> PDF without a composer dependency.
 *
 * The preferred path is a headless renderer (a Dompdf install, or a wkhtmltopdf
 * binary) if the host has one. When it does not, this falls back to a built-in
 * minimal PDF writer so reports can still be attached to an email or WhatsApp
 * message. The fallback handles the small subset of HTML the reports use:
 * headings, paragraphs, tables, bold and italic.
 */
final class PdfService
{
    /**
     * Render an HTML string to PDF bytes.
     *
     * @param array<string,mixed> $opts title, subject, footer
     */
    public static function fromHtml(string $html, array $opts = []): string
    {
        $engine = (string) App::instance()->config('pdf.engine', 'auto');
        $dompdf = (string) App::instance()->config('pdf.dompdf_autoload', '');

        if ($engine === 'dompdf' || ($engine === 'auto' && $dompdf !== '' && is_file($dompdf))) {
            $bytes = self::viaDompdf($html, $opts, $dompdf);
            if ($bytes !== null) {
                return $bytes;
            }
        }

        $binary = (string) App::instance()->config('pdf.binary', '');
        if ($binary !== '' && is_executable($binary)) {
            $bytes = self::viaBinary($html, $opts, $binary);
            if ($bytes !== null) {
                return $bytes;
            }
        }

        return self::fallback($html, $opts);
    }

    /** @param array<string,mixed> $opts */
    private static function viaDompdf(string $html, array $opts, string $autoload): ?string
    {
        try {
            if ($autoload !== '' && is_file($autoload)) {
                require_once $autoload;
            }
            if (!class_exists('\\Dompdf\\Dompdf')) {
                return null;
            }
            $class = '\\Dompdf\\Dompdf';
            $dompdf = new $class(['isRemoteEnabled' => false]);
            $dompdf->loadHtml($html, 'UTF-8');
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();
            return (string) $dompdf->output();
        } catch (\Throwable $e) {
            App::instance()->log('warn', 'dompdf render failed, using fallback', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /** @param array<string,mixed> $opts */
    private static function viaBinary(string $html, array $opts, string $binary): ?string
    {
        $tmpHtml = tempnam(sys_get_temp_dir(), 'licpdf_') . '.html';
        $tmpPdf = $tmpHtml . '.pdf';
        file_put_contents($tmpHtml, $html);
        $cmd = escapeshellcmd($binary) . ' --quiet --encoding utf-8 '
            . escapeshellarg($tmpHtml) . ' ' . escapeshellarg($tmpPdf) . ' 2>/dev/null';
        @exec($cmd, $out, $code);
        $bytes = is_file($tmpPdf) ? (string) file_get_contents($tmpPdf) : null;
        @unlink($tmpHtml);
        @unlink($tmpPdf);
        return ($code === 0 && $bytes !== null && $bytes !== '') ? $bytes : null;
    }

    /**
     * Minimal, dependency-free PDF writer. Enough for text reports: it lays the
     * document out as fixed-width lines using the core Helvetica font.
     *
     * @param array<string,mixed> $opts
     */
    public static function fallback(string $html, array $opts = []): string
    {
        $title = (string) ($opts['title'] ?? 'Jackisa Office Report');
        $lines = self::htmlToLines($html);
        array_unshift($lines, $title, str_repeat('=', min(70, strlen($title))), '');

        $pageWidth = 595;   // A4 points
        $pageHeight = 842;
        $margin = 48;
        $lineHeight = 14;
        $maxLines = (int) floor(($pageHeight - $margin * 2) / $lineHeight);
        $pages = array_chunk($lines, $maxLines);
        if (!$pages) {
            $pages = [['']];
        }

        $objects = [];
        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        // /Pages is filled in once we know the kids.
        $objects[] = ''; // placeholder index 1

        $fontId = 3 + count($pages) * 2;
        $kids = [];

        $pageObjStart = count($objects) + 1; // next object number
        foreach ($pages as $i => $pageLines) {
            $pageObjNum = $pageObjStart + $i * 2;
            $contentObjNum = $pageObjNum + 1;
            $kids[] = $pageObjNum . ' 0 R';

            $content = "BT\n/F1 11 Tf\n{$lineHeight} TL\n" . $margin . ' ' . ($pageHeight - $margin) . " Td\n";
            foreach ($pageLines as $line) {
                $content .= '(' . self::escape($line) . ") Tj\nT*\n";
            }
            $content .= "ET";

            $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' . $pageWidth . ' ' . $pageHeight . ']'
                . ' /Resources << /Font << /F1 ' . $fontId . ' 0 R >> >> /Contents ' . $contentObjNum . ' 0 R >>';
            $objects[] = '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream";
        }

        $objects[1] = '<< /Type /Pages /Count ' . count($kids) . ' /Kids [' . implode(' ', $kids) . '] >>';
        $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

        return self::assemble($objects);
    }

    /** @param array<int,string> $objects */
    private static function assemble(array $objects): string
    {
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $i => $body) {
            $offsets[$i] = strlen($pdf);
            $num = $i + 1;
            $pdf .= "$num 0 obj\n$body\nendobj\n";
        }
        $xrefPos = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 $count\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= str_pad((string) $offset, 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        }
        $pdf .= "trailer\n<< /Size $count /Root 1 0 R >>\nstartxref\n$xrefPos\n%%EOF";
        return $pdf;
    }

    /** @return array<int,string> */
    private static function htmlToLines(string $html): array
    {
        $html = preg_replace('/<(script|style)[^>]*>.*?<\/\1>/is', '', $html) ?? $html;
        $html = preg_replace('/<\/(tr|div|p|h[1-6]|li|table)>/i', "\n", $html) ?? $html;
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html) ?? $html;
        $html = preg_replace('/<\/(td|th)>/i', ' | ', $html) ?? $html;
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        $out = [];
        foreach (preg_split('/\r?\n/', $text) ?: [] as $raw) {
            $line = trim(preg_replace('/[ \t]+/', ' ', $raw) ?? '');
            $line = trim($line, '|');
            $line = trim($line);
            if ($line === '') {
                $out[] = '';
                continue;
            }
            foreach (self::wrap($line, 90) as $wrapped) {
                $out[] = $wrapped;
            }
        }
        return $out;
    }

    /** @return array<int,string> */
    private static function wrap(string $line, int $width): array
    {
        if (strlen($line) <= $width) {
            return [$line];
        }
        return explode("\n", wordwrap($line, $width, "\n", true));
    }

    private static function escape(string $text): string
    {
        // PDF strings are latin-1; transliterate anything outside it.
        $text = iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $text) ?: $text;
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }
}
