<?php
declare(strict_types=1);

namespace Jackisa\Lic\Service;

use Jackisa\Lic\App;
use Jackisa\Lic\Support\Ids;

/**
 * Tenants (companies/institutions), users and memberships — the central
 * directory that stays synchronised with jackisa.com and office.
 */
final class TenantService
{
    public static function upsertTenant(array $data): string
    {
        $app = App::instance();
        $id = $data['id'] ?? ($data['supabase_company_id'] ?? null);

        if (!$id && !empty($data['email'])) {
            $existing = $app->one('SELECT id FROM tenants WHERE email = ?', [$data['email']]);
            $id = $existing['id'] ?? null;
        }
        if (!$id && !empty($data['supabase_company_id'])) {
            $existing = $app->one('SELECT id FROM tenants WHERE supabase_company_id = ?', [$data['supabase_company_id']]);
            $id = $existing['id'] ?? null;
        }
        $id = $id ?: Ids::uuid();

        $app->run(
            'INSERT INTO tenants (id, name, slug, email, phone, industry, country, currency, kind, logo_url, supabase_company_id, synced_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name), slug = VALUES(slug), email = VALUES(email), phone = VALUES(phone),
               industry = VALUES(industry), country = VALUES(country), currency = VALUES(currency),
               kind = VALUES(kind), logo_url = VALUES(logo_url),
               supabase_company_id = COALESCE(VALUES(supabase_company_id), supabase_company_id),
               synced_at = NOW()',
            [
                $id,
                $data['name'] ?? 'Untitled',
                $data['slug'] ?? null,
                $data['email'] ?? null,
                $data['phone'] ?? null,
                $data['industry'] ?? null,
                $data['country'] ?? null,
                $data['currency'] ?? 'UGX',
                ($data['kind'] ?? 'company') === 'institution' ? 'institution' : 'company',
                $data['logo_url'] ?? null,
                $data['supabase_company_id'] ?? null,
            ]
        );

        return $id;
    }

    /**
     * Guarantee a tenant row exists for this id before anything references it.
     *
     * Trials, licences, subscriptions and memberships all carry a foreign key to
     * `tenants`, so a request that arrives before the tenant has been synced
     * from office/jackisa.com would otherwise fail the FK and 500. This is
     * idempotent: an existing row is left untouched (only the optional links are
     * filled in), and it never clobbers a richer record already on file.
     */
    public static function ensureTenant(string $id, array $seed = []): void
    {
        if ($id === '') {
            return;
        }
        $app = App::instance();
        $app->run(
            'INSERT INTO tenants (id, name, slug, email, phone, industry, country, currency, kind, logo_url, supabase_company_id, synced_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE
               name = IF(name = "" OR name IS NULL, VALUES(name), name),
               email = COALESCE(email, VALUES(email)),
               supabase_company_id = COALESCE(supabase_company_id, VALUES(supabase_company_id)),
               updated_at = NOW()',
            [
                $id,
                $seed['name'] ?? 'Untitled workspace',
                $seed['slug'] ?? null,
                $seed['email'] ?? null,
                $seed['phone'] ?? null,
                $seed['industry'] ?? null,
                $seed['country'] ?? null,
                $seed['currency'] ?? 'UGX',
                ($seed['kind'] ?? 'company') === 'institution' ? 'institution' : 'company',
                $seed['logo_url'] ?? null,
                $seed['supabase_company_id'] ?? null,
            ]
        );
    }

    public static function upsertUser(array $data): string
    {
        $app = App::instance();
        $id = $data['id'] ?? ($data['supabase_user_id'] ?? null);

        if (!$id && !empty($data['email'])) {
            $existing = $app->one('SELECT id FROM users WHERE email = ?', [$data['email']]);
            $id = $existing['id'] ?? null;
        }
        if (!$id && !empty($data['jackisa_user_id'])) {
            $existing = $app->one('SELECT id FROM users WHERE jackisa_user_id = ?', [$data['jackisa_user_id']]);
            $id = $existing['id'] ?? null;
        }
        $id = $id ?: Ids::uuid();

        $app->run(
            'INSERT INTO users (id, email, full_name, phone, avatar_url, jackisa_user_id, supabase_user_id, kyc_status, kyc_level, kyc_verified_at, is_active, synced_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE
               email = VALUES(email), full_name = VALUES(full_name),
               phone = COALESCE(VALUES(phone), phone),
               avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
               jackisa_user_id = COALESCE(VALUES(jackisa_user_id), jackisa_user_id),
               supabase_user_id = COALESCE(VALUES(supabase_user_id), supabase_user_id),
               kyc_status = IF(VALUES(kyc_status) = \'verified\' OR kyc_status = \'verified\', \'verified\', VALUES(kyc_status)),
               kyc_level = IF(VALUES(kyc_level) <> \'none\', VALUES(kyc_level), kyc_level),
               kyc_verified_at = COALESCE(VALUES(kyc_verified_at), kyc_verified_at),
               is_active = VALUES(is_active),
               synced_at = NOW()',
            [
                $id,
                strtolower($data['email'] ?? ''),
                $data['full_name'] ?? 'User',
                $data['phone'] ?? null,
                $data['avatar_url'] ?? null,
                $data['jackisa_user_id'] ?? null,
                $data['supabase_user_id'] ?? null,
                in_array($data['kyc_status'] ?? '', ['unverified', 'pending', 'verified', 'rejected'], true) ? $data['kyc_status'] : 'unverified',
                in_array($data['kyc_level'] ?? '', ['none', 'individual', 'company'], true) ? $data['kyc_level'] : 'none',
                $data['kyc_verified_at'] ?? null,
                isset($data['is_active']) ? (int) (bool) $data['is_active'] : 1,
            ]
        );

        return $id;
    }

    public static function addMember(string $tenantId, string $userId, string $role = 'employee', string $status = 'active', bool $isOwner = false): void
    {
        $app = App::instance();
        $app->run(
            'INSERT INTO tenant_members (id, tenant_id, user_id, role, status, is_owner, joined_at)
             VALUES (?,?,?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status),
               is_owner = GREATEST(is_owner, VALUES(is_owner))',
            [Ids::uuid(), $tenantId, $userId, $role, $status, $isOwner ? 1 : 0]
        );
    }

    /** Individual KYC on jackisa.com auto-verifies here. */
    public static function markIndividualVerified(string $userId, array $meta = []): void
    {
        App::instance()->run(
            "UPDATE users SET kyc_status = 'verified', kyc_level = 'individual', kyc_verified_at = NOW(), updated_at = NOW()
             WHERE id = ? AND kyc_status <> 'verified'",
            [$userId]
        );
        App::instance()->run(
            "INSERT INTO kyc_records (id, subject_type, subject_id, level, status, document_type, document_ref, verified_at, notes)
             VALUES (?,?,?,?,?,?,?,NOW(),?)",
            [Ids::uuid(), 'user', $userId, 'individual', 'verified',
             $meta['document_type'] ?? 'jackisa_account', $meta['document_ref'] ?? null,
             $meta['note'] ?? 'Auto-verified via jackisa.com account']
        );
    }

    /** Company KYC verification (gold badge). */
    public static function markCompanyVerified(string $tenantId, array $meta = []): void
    {
        $app = App::instance();
        $app->run(
            "INSERT INTO kyc_records (id, subject_type, subject_id, level, status, document_type, document_ref, verified_at, notes)
             VALUES (?,?,?,?,?,?,?,NOW(),?)",
            [Ids::uuid(), 'tenant', $tenantId, 'company', 'verified',
             $meta['document_type'] ?? 'company_registration', $meta['document_ref'] ?? null,
             $meta['note'] ?? 'Company verified']
        );
        $app->run('UPDATE tenants SET updated_at = NOW() WHERE id = ?', [$tenantId]);
    }

    /** @return array<string,mixed> */
    public static function tenantSummary(string $tenantId): array
    {
        $app = App::instance();
        $tenant = $app->one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        if ($tenant === null) {
            throw new \InvalidArgumentException('Unknown tenant');
        }
        $license = $app->one(
            "SELECT * FROM licenses WHERE tenant_id = ? ORDER BY FIELD(status,'active','trial','grace','expired','suspended','revoked'), expires_at DESC LIMIT 1",
            [$tenantId]
        );
        $subscription = $app->one(
            "SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
            [$tenantId]
        );
        $members = (int) ($app->one(
            "SELECT COUNT(*) AS c FROM tenant_members WHERE tenant_id = ? AND status = 'active'",
            [$tenantId]
        )['c'] ?? 0);
        $kyc = $app->one(
            "SELECT status FROM kyc_records WHERE subject_type = 'tenant' AND subject_id = ? AND status = 'verified' LIMIT 1",
            [$tenantId]
        );

        return [
            'tenant'       => $tenant,
            'license'      => $license,
            'subscription' => $subscription,
            'member_count' => $members,
            'verified'     => $kyc !== null,
            'badge'        => $kyc !== null ? 'gold' : null,
        ];
    }
}
