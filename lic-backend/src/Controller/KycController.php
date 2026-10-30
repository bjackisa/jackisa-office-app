<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\TenantService;

/**
 * /api/v1/kyc — verification of companies and individuals.
 *
 * Individuals already verified on jackisa.com arrive pre-verified through the
 * SSO handshake (AuthController::jackisa marks them). Companies are verified
 * here, by an operator, and carry the gold badge. Individuals carry the blue
 * badge.
 */
final class KycController
{
    /** POST /api/v1/kyc/verify — approve a subject and issue its badge. */
    public static function verify(Request $request): void
    {
        Auth::requireApiKey($request);
        $subjectType = $request->string('subject_type');
        $subjectId = $request->string('subject_id');
        if (!in_array($subjectType, ['user', 'tenant'], true) || $subjectId === '') {
            Response::error('422', 'subject_type (user|tenant) and subject_id are required', 422);
        }

        $level = $subjectType === 'tenant' ? 'company' : 'individual';
        $badge = $subjectType === 'tenant' ? 'gold' : 'blue';

        self::upsertRecord($subjectType, $subjectId, $level, 'verified', [
            'document_type' => $request->string('document_type'),
            'document_ref'  => $request->string('document_ref'),
            'notes'         => $request->string('notes'),
            'verified_by'   => $request->string('verified_by'),
        ]);

        if ($subjectType === 'tenant') {
            TenantService::markCompanyVerified($subjectId, ['source' => 'lic-kyc']);
        } else {
            TenantService::markIndividualVerified($subjectId, ['source' => 'lic-kyc']);
        }

        Response::ok(['subject_type' => $subjectType, 'subject_id' => $subjectId, 'badge' => $badge, 'status' => 'verified']);
    }

    /** POST /api/v1/kyc/reject */
    public static function reject(Request $request): void
    {
        Auth::requireApiKey($request);
        $subjectType = $request->string('subject_type');
        $subjectId = $request->string('subject_id');
        if (!in_array($subjectType, ['user', 'tenant'], true) || $subjectId === '') {
            Response::error('422', 'subject_type (user|tenant) and subject_id are required', 422);
        }
        self::upsertRecord($subjectType, $subjectId, $subjectType === 'tenant' ? 'company' : 'individual', 'rejected', [
            'notes' => $request->string('notes'),
        ]);
        Response::ok(['subject_type' => $subjectType, 'subject_id' => $subjectId, 'status' => 'rejected']);
    }

    /**
     * POST /api/v1/kyc/auto
     * Called by the office app when a user signs in with jackisa.com and is
     * already verified there. Idempotent.
     */
    public static function auto(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $userId = $request->string('user_id');
        $verified = $request->bool('verified', true);
        if ($userId === '') {
            Response::error('422', 'user_id is required', 422);
        }
        if ($verified) {
            self::upsertRecord('user', $userId, 'individual', 'verified', ['notes' => 'Auto-verified via jackisa.com']);
            TenantService::markIndividualVerified($userId, ['source' => 'jackisa-auto']);
        }
        Response::ok(['user_id' => $userId, 'verified' => $verified, 'badge' => $verified ? 'blue' : null]);
    }

    /** GET /api/v1/kyc/badge?subject_type=tenant&subject_id=... */
    public static function badge(Request $request): void
    {
        Auth::requirePeer($request);
        $subjectType = $request->string('subject_type');
        $subjectId = $request->string('subject_id');
        $row = App::instance()->one(
            'SELECT status FROM kyc_records WHERE subject_type = ? AND subject_id = ? LIMIT 1',
            [$subjectType, $subjectId]
        );
        $verified = $row !== null && $row['status'] === 'verified';
        Response::ok([
            'verified' => $verified,
            'badge'    => $verified ? ($subjectType === 'tenant' ? 'gold' : 'blue') : null,
        ]);
    }

    /**
     * @param array<string,mixed> $meta
     */
    private static function upsertRecord(string $subjectType, string $subjectId, string $level, string $status, array $meta): void
    {
        $app = App::instance();
        $existing = $app->one(
            'SELECT id FROM kyc_records WHERE subject_type = ? AND subject_id = ? LIMIT 1',
            [$subjectType, $subjectId]
        );
        $verifiedAt = $status === 'verified' ? date('Y-m-d H:i:s') : null;
        if ($existing !== null) {
            $app->run(
                'UPDATE kyc_records SET level = ?, status = ?, document_type = COALESCE(?, document_type),
                   document_ref = COALESCE(?, document_ref), notes = COALESCE(?, notes),
                   verified_at = ?, updated_at = NOW() WHERE id = ?',
                [
                    $level, $status,
                    $meta['document_type'] ?: null, $meta['document_ref'] ?: null, $meta['notes'] ?: null,
                    $verifiedAt, $existing['id'],
                ]
            );
            return;
        }
        $app->run(
            'INSERT INTO kyc_records (id, subject_type, subject_id, level, status, document_type, document_ref, notes, verified_at)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                \Jackisa\Lic\Support\Ids::uuid(), $subjectType, $subjectId, $level, $status,
                $meta['document_type'] ?: null, $meta['document_ref'] ?: null, $meta['notes'] ?: null, $verifiedAt,
            ]
        );
    }
}
