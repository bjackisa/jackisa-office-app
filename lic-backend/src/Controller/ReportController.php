<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\MailService;
use Jackisa\Lic\Service\PdfService;
use Jackisa\Lic\Service\WhatsAppService;

/**
 * /api/v1/reports — the compute-heavy work the serverless office app cannot do.
 *
 * Everything here is deterministic: it reads figures the office app publishes
 * to the hub, computes tax / NAV / dividends, stores the result and can email
 * or WhatsApp a PDF of it. No LLM, no cron inside the app.
 */
final class ReportController
{
    /** POST /api/v1/reports/income-tax — evaluate Uganda income tax. */
    public static function incomeTax(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        $gross = $request->float('gross_income');
        $expenses = $request->float('allowable_expenses');
        $vatInput = $request->float('vat_input');
        $vatOutput = $request->float('vat_output');
        $chargeable = max(0.0, $gross - $expenses);
        $tax = self::ugandaCorporateTax($chargeable);

        $result = [
            'period_start'       => $request->string('period_start', date('Y-01-01')),
            'period_end'         => $request->string('period_end', date('Y-m-d')),
            'gross_income'       => round($gross, 2),
            'allowable_expenses' => round($expenses, 2),
            'chargeable_income'  => round($chargeable, 2),
            'tax_payable'        => $tax,
            'vat_input'          => round($vatInput, 2),
            'vat_output'         => round($vatOutput, 2),
            'net_vat_payable'    => round(max(0.0, $vatOutput - $vatInput), 2),
            'currency'           => 'UGX',
        ];

        self::storeTaxSnapshot($tenantId, $result);
        Response::ok($result);
    }

    /** POST /api/v1/reports/income-tax/csv — URA-ready CSV of the same figures. */
    public static function incomeTaxCsv(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $tenantId = $request->string('tenant_id');
        $data = $request->input('data');
        if (!is_array($data)) {
            $row = App::instance()->one(
                'SELECT * FROM tax_snapshots WHERE tenant_id = ? ORDER BY period_end DESC LIMIT 1',
                [$tenantId]
            );
            $data = $row ?? [];
        }

        $rows = [
            ['Field', 'Value', 'Currency', 'Notes'],
            ['Taxpayer TIN', $request->string('tin', '—'), '', 'Enter the company TIN'],
            ['Period start', (string) ($data['period_start'] ?? ''), '', 'Filing period'],
            ['Period end', (string) ($data['period_end'] ?? ''), '', 'Filing period'],
            ['Gross income', (string) ($data['gross_income'] ?? 0), 'UGX', 'Total turnover'],
            ['Allowable expenses', (string) ($data['allowable_expenses'] ?? 0), 'UGX', 'Deductible costs'],
            ['Chargeable income', (string) ($data['chargeable_income'] ?? 0), 'UGX', 'Gross less allowable'],
            ['Income tax payable', (string) ($data['tax_payable'] ?? 0), 'UGX', '30% standard / 1% presumptive'],
            ['VAT output', (string) ($data['vat_output'] ?? 0), 'UGX', 'Output tax charged'],
            ['VAT input', (string) ($data['vat_input'] ?? 0), 'UGX', 'Input tax paid'],
            ['Net VAT payable', (string) ($data['net_vat_payable'] ?? 0), 'UGX', 'Output less input'],
        ];

        $csv = '';
        foreach ($rows as $r) {
            $csv .= implode(',', array_map(static fn ($v) => '"' . str_replace('"', '""', (string) $v) . '"', $r)) . "\n";
        }

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="jackisa-income-tax-' . date('Ymd') . '.csv"');
        header('X-Content-Type-Options: nosniff');
        echo $csv;
        exit;
    }

    /** POST /api/v1/reports/fund-nav — compute unit-trust NAV and snapshot it. */
    public static function fundNav(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $tenantId = $request->string('tenant_id');
        $assets = $request->float('total_assets');
        $liabilities = $request->float('total_liabilities');
        $units = $request->float('units_outstanding');
        $nav = $units > 0 ? ($assets - $liabilities) / $units : 0.0;

        $result = [
            'as_of'             => $request->string('as_of', date('Y-m-d')),
            'total_assets'      => round($assets, 2),
            'total_liabilities' => round($liabilities, 2),
            'net_assets'        => round($assets - $liabilities, 2),
            'units_outstanding' => round($units, 6),
            'nav_per_unit'      => round($nav, 6),
            'currency'          => 'UGX',
        ];
        self::storeFundSnapshot($tenantId, $result);
        Response::ok($result);
    }

    /**
     * POST /api/v1/reports/dividends
     * Body: { tenant_id, total_amount, basis: 'units'|'equal', holders: [{user_id, units, name}] }
     *
     * Splits a declared dividend across holders by units held (or equally) and
     * stores an approved dividend run.
     */
    public static function dividends(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $tenantId = $request->string('tenant_id');
        $total = $request->float('total_amount');
        $basis = $request->string('basis', 'units');
        $holders = $request->input('holders');
        if (!is_array($holders) || !$holders) {
            Response::error('422', 'holders is required', 422);
        }

        $totalUnits = 0.0;
        foreach ($holders as $h) {
            $totalUnits += (float) ($h['units'] ?? 0);
        }

        $allocations = [];
        $remaining = $total;
        $count = count($holders);
        foreach ($holders as $i => $h) {
            if ($basis === 'equal') {
                $amount = $count > 0 ? $total / $count : 0.0;
            } else {
                $units = (float) ($h['units'] ?? 0);
                $amount = $totalUnits > 0 ? $total * ($units / $totalUnits) : 0.0;
            }
            $amount = round($amount, 2);
            $remaining -= $amount;
            $allocations[] = [
                'user_id' => (string) ($h['user_id'] ?? ''),
                'name'    => (string) ($h['name'] ?? ''),
                'units'   => (float) ($h['units'] ?? 0),
                'amount'  => $amount,
            ];
        }
        // Push any rounding remainder onto the first allocation.
        if ($allocations && abs($remaining) >= 0.01) {
            $allocations[0]['amount'] = round($allocations[0]['amount'] + $remaining, 2);
        }

        $runId = \Jackisa\Lic\Support\Ids::uuid();
        App::instance()->run(
            'INSERT INTO dividend_runs (id, tenant_id, run_date, total_amount, currency, status, payload)
             VALUES (?,?,?,?,?,?,?)',
            [$runId, $tenantId, $request->string('run_date', date('Y-m-d')), $total, 'UGX', 'approved',
             json_encode(['basis' => $basis, 'allocations' => $allocations], JSON_UNESCAPED_SLASHES)]
        );

        Response::ok(['run_id' => $runId, 'total_amount' => round($total, 2), 'allocations' => $allocations]);
    }

    /**
     * POST /api/v1/reports/pdf
     * Body: { html, to?, subject?, channel?: 'email'|'whatsapp'|'none', filename? }
     *
     * Renders HTML to a PDF and, when a recipient is given, delivers it.
     */
    public static function pdf(Request $request): void
    {
        Auth::requirePeer($request);
        $html = (string) $request->input('html', '');
        if (trim($html) === '') {
            Response::error('422', 'html is required', 422);
        }
        $subject = $request->string('subject', 'Jackisa Office report');
        $filename = $request->string('filename', 'jackisa-report.pdf');
        $pdf = PdfService::fromHtml($html, ['title' => $subject]);

        $channel = $request->string('channel', 'none');
        $to = $request->string('to');
        $delivered = null;

        if ($channel === 'email' && $to !== '') {
            $delivered = MailService::send([$to], $subject, '<p>Your report is attached.</p>', [], [
                'attachment' => ['filename' => $filename, 'mime' => 'application/pdf', 'data' => $pdf],
                'template'   => 'report_pdf',
            ]);
        } elseif ($channel === 'whatsapp' && $to !== '') {
            $delivered = WhatsAppService::send($to, $subject, [
                'media' => ['filename' => $filename, 'data' => base64_encode($pdf)],
                'template' => 'report_pdf',
            ]);
        }

        Response::ok([
            'filename' => $filename,
            'bytes'    => strlen($pdf),
            'base64'   => base64_encode($pdf),
            'delivered' => $delivered,
        ]);
    }

    /**
     * Uganda corporate income tax.
     *  - turnover up to the presumptive threshold: 1% of chargeable income
     *  - otherwise the standard 30% corporate rate
     */
    public static function ugandaCorporateTax(float $chargeable): float
    {
        if ($chargeable <= 0) {
            return 0.0;
        }
        $threshold = (float) App::instance()->config('tax.presumptive_threshold', 150_000_000);
        if ($chargeable <= $threshold) {
            return round($chargeable * 0.01, 2);
        }
        return round($chargeable * 0.30, 2);
    }

    /** @param array<string,mixed> $data */
    private static function storeTaxSnapshot(string $tenantId, array $data): void
    {
        App::instance()->run(
            'INSERT INTO tax_snapshots (id, tenant_id, period_start, period_end, gross_income, allowable_expenses, chargeable_income, tax_payable, currency, payload)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE gross_income = VALUES(gross_income), allowable_expenses = VALUES(allowable_expenses),
               chargeable_income = VALUES(chargeable_income), tax_payable = VALUES(tax_payable), payload = VALUES(payload)',
            [
                \Jackisa\Lic\Support\Ids::uuid(), $tenantId, $data['period_start'], $data['period_end'],
                $data['gross_income'], $data['allowable_expenses'], $data['chargeable_income'], $data['tax_payable'],
                $data['currency'], json_encode($data, JSON_UNESCAPED_SLASHES),
            ]
        );
    }

    /** @param array<string,mixed> $data */
    private static function storeFundSnapshot(string $tenantId, array $data): void
    {
        App::instance()->run(
            'INSERT INTO fund_snapshots (id, tenant_id, as_of, total_assets, total_liabilities, nav_per_unit, units_outstanding, currency, payload)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE total_assets = VALUES(total_assets), total_liabilities = VALUES(total_liabilities),
               nav_per_unit = VALUES(nav_per_unit), units_outstanding = VALUES(units_outstanding), payload = VALUES(payload)',
            [
                \Jackisa\Lic\Support\Ids::uuid(), $tenantId, $data['as_of'],
                $data['total_assets'], $data['total_liabilities'], $data['nav_per_unit'],
                $data['units_outstanding'], $data['currency'], json_encode($data, JSON_UNESCAPED_SLASHES),
            ]
        );
    }
}
