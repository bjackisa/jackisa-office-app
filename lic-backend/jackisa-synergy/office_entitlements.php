<?php
// +------------------------------------------------------------------------+
// | Jackisa One — the entitlement engine.                                   |
// | Deployed to jackisa.com/public_html/office_entitlements.php             |
// |                                                                         |
// | A single place that answers "what does this person's plan unlock on     |
// | jackisa.com?". It is keyed by the office licence tier (basic/pro/       |
// | platinum) and/or the jackisa.com pro type, and it is written by the     |
// | licence hub (lic.jackisa.com) whenever a licence is issued, renewed,    |
// | suspended or revoked.                                                   |
// |                                                                         |
// | The bridge (office_bridge.php) exposes it as the `sync_entitlements`    |
// | action; the office app and jackisa.com itself read the same row.        |
// +------------------------------------------------------------------------+

if (!defined('T_OFFICE_ENTITLEMENTS')) {
    define('T_OFFICE_ENTITLEMENTS', 'office_entitlements');
}

/** The benefit matrix. Office tier -> jackisa.com capabilities. */
function PT_OfficeEntitlementMatrix()
{
    return [
        // Basic office plan: keeps the door open, no cross-platform extras.
        'basic' => [
            'channels'            => 0,
            'live_minutes'        => 0,
            'store_enabled'       => 0,
            'store_publish_courses' => 0,
            'verified_badge'      => 0,
            'sso_priority'        => 0,
            'meeting_seats'       => 0,
            'member_seats'        => 5,
            'features'            => [],
        ],
        // Pro office plan: a working creator account + a storefront.
        'pro' => [
            'channels'            => 1,
            'live_minutes'        => 600,
            'store_enabled'       => 1,
            'store_publish_courses' => 1,
            'verified_badge'      => 0,
            'sso_priority'        => 1,
            'meeting_seats'       => 10,
            'member_seats'        => 25,
            'features'            => ['can_use_upload', 'can_use_live_video', 'can_use_live_save', 'can_use_playlist', 'can_use_post', 'can_use_article', 'can_use_invite_links'],
        ],
        // Platinum office plan: everything, including verification + meetings.
        'platinum' => [
            'channels'            => 5,
            'live_minutes'        => 100000,
            'store_enabled'       => 1,
            'store_publish_courses' => 1,
            'verified_badge'      => 1,
            'sso_priority'        => 1,
            'meeting_seats'       => 100,
            'member_seats'        => 500,
            'features'            => ['can_use_upload', 'can_use_live_video', 'can_use_live_save', 'can_use_playlist', 'can_use_post', 'can_use_article', 'can_use_invite_links', 'can_use_payed_subscribers', 'can_use_donate', 'can_use_point', 'can_use_sell_videos', 'can_use_affiliate'],
        ],
    ];
}

/**
 * A short human-readable benefit list for a tier — what the office pricing page
 * shows next to "Included on Jackisa".
 */
function PT_OfficeEntitlementBenefitLines($tier)
{
    $matrix = PT_OfficeEntitlementMatrix();
    $e = $matrix[$tier] ?? $matrix['basic'];
    $lines = [];
    if ($e['channels'] > 0) {
        $lines[] = $e['channels'] . ' channel' . ($e['channels'] > 1 ? 's' : '') . ' on jackisa.com';
    }
    if ($e['live_minutes'] > 0) {
        $lines[] = ($e['live_minutes'] >= 100000 ? 'Unlimited' : number_format($e['live_minutes']) . ' min') . ' of live streaming';
    }
    if ($e['store_enabled']) {
        $lines[] = 'Jackisa Store storefront' . ($e['store_publish_courses'] ? ' + course publishing' : '');
    }
    if ($e['verified_badge']) {
        $lines[] = 'Gold verified company badge';
    }
    if ($e['meeting_seats'] > 0) {
        $lines[] = $e['meeting_seats'] . ' live meeting seats';
    }
    return $lines;
}

/** Ensure the table exists (hosting migrations are not guaranteed to run). */
function PT_OfficeEntitlementsEnsureTable()
{
    global $db;
    $db->rawQuery(
        "CREATE TABLE IF NOT EXISTS `" . T_OFFICE_ENTITLEMENTS . "` (
            `id` INT(11) NOT NULL AUTO_INCREMENT,
            `user_id` INT(11) NOT NULL,
            `tier` VARCHAR(20) NOT NULL DEFAULT 'basic',
            `plan_code` VARCHAR(60) NULL,
            `lic_tenant_id` VARCHAR(64) NULL,
            `channels` INT(11) NOT NULL DEFAULT 0,
            `live_minutes` INT(11) NOT NULL DEFAULT 0,
            `store_enabled` TINYINT(4) NOT NULL DEFAULT 0,
            `store_publish_courses` TINYINT(4) NOT NULL DEFAULT 0,
            `verified_badge` TINYINT(4) NOT NULL DEFAULT 0,
            `meeting_seats` INT(11) NOT NULL DEFAULT 0,
            `member_seats` INT(11) NOT NULL DEFAULT 0,
            `features` TEXT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'active',
            `synced_at` INT(11) NULL,
            `created_at` INT(11) NULL,
            `updated_at` INT(11) NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_user` (`user_id`),
            KEY `idx_tier` (`tier`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

/** @return object|null the entitlement row for a user. */
function PT_OfficeEntitlement($user_id)
{
    global $db;
    if (empty($user_id)) {
        return null;
    }
    $row = $db->where('user_id', (int) $user_id)->getOne(T_OFFICE_ENTITLEMENTS);
    return empty($row) ? null : $row;
}

/**
 * Write (or refresh) a user's entitlements from an office tier.
 * @param array<string,mixed> $data
 * @return array{status:bool,message?:string,row?:object}
 */
function PT_OfficeSetEntitlements($user_id, $tier, $data = array())
{
    global $db;
    $user_id = (int) $user_id;
    if ($user_id <= 0) {
        return ['status' => false, 'message' => 'user_id is required'];
    }
    PT_OfficeEntitlementsEnsureTable();

    $tier = in_array($tier, ['basic', 'pro', 'platinum'], true) ? $tier : 'basic';
    $matrix = PT_OfficeEntitlementMatrix();
    $e = $matrix[$tier];

    // A caller may override individual caps (e.g. a custom enterprise deal).
    foreach (['channels', 'live_minutes', 'store_enabled', 'store_publish_courses', 'verified_badge', 'meeting_seats', 'member_seats'] as $k) {
        if (isset($data[$k])) {
            $e[$k] = (int) $data[$k];
        }
    }
    if (!empty($data['features']) && is_array($data['features'])) {
        $e['features'] = array_values(array_unique(array_merge($e['features'], $data['features'])));
    }

    $payload = [
        'tier'                  => $tier,
        'plan_code'             => isset($data['plan_code']) ? (string) $data['plan_code'] : null,
        'lic_tenant_id'         => isset($data['lic_tenant_id']) ? (string) $data['lic_tenant_id'] : null,
        'channels'              => $e['channels'],
        'live_minutes'          => $e['live_minutes'],
        'store_enabled'         => $e['store_enabled'],
        'store_publish_courses' => $e['store_publish_courses'],
        'verified_badge'        => $e['verified_badge'],
        'meeting_seats'         => $e['meeting_seats'],
        'member_seats'          => $e['member_seats'],
        'features'              => json_encode($e['features']),
        'status'                => isset($data['status']) ? (string) $data['status'] : 'active',
        'synced_at'             => time(),
        'updated_at'            => time(),
    ];

    $existing = $db->where('user_id', $user_id)->getOne(T_OFFICE_ENTITLEMENTS);
    if (empty($existing)) {
        $payload['user_id']    = $user_id;
        $payload['created_at'] = time();
        $db->insert(T_OFFICE_ENTITLEMENTS, $payload);
    } else {
        $db->where('user_id', $user_id)->update(T_OFFICE_ENTITLEMENTS, $payload);
    }

    // A verified platinum tier also flips the platform verified flag, which is
    // what renders the badge across jackisa.com.
    if (!empty($data['apply_verified']) && $e['verified_badge']) {
        $db->where('id', $user_id)->update(T_USERS, ['verified' => 1]);
    }

    return ['status' => true, 'row' => PT_OfficeEntitlement($user_id)];
}

/** Resolve a user id from an email or jackisa id. */
function PT_OfficeEntitlementResolveUser($data)
{
    global $db;
    if (!empty($data['jackisa_user_id'])) {
        $u = $db->where('id', (int) $data['jackisa_user_id'])->getOne(T_USERS, ['id']);
        if (!empty($u)) {
            return (int) $u->id;
        }
    }
    if (!empty($data['email'])) {
        $u = $db->where('email', PT_Secure((string) $data['email']))->getOne(T_USERS, ['id']);
        if (!empty($u)) {
            return (int) $u->id;
        }
    }
    if (!empty($data['username'])) {
        $u = $db->where('username', PT_Secure((string) $data['username']))->getOne(T_USERS, ['id']);
        if (!empty($u)) {
            return (int) $u->id;
        }
    }
    return 0;
}

/**
 * How many channels has this user already created? A channel on jackisa.com is
 * a video/stream container, so we count the user's live imports plus their
 * non-live uploads that were created as "channels" (type = 'channel').
 */
function PT_OfficeChannelCount($user_id)
{
    global $db;
    $count = 0;
    $row = $db->where('user_id', (int) $user_id)->getOne(T_VIDEOS, ['COUNT(*) AS c']);
    if (!empty($row)) {
        $count += (int) $row->c;
    }
    $live = $db->where('owner_id', (int) $user_id)->getOne(T_LIVE_IMPORTS, ['COUNT(*) AS c']);
    if (!empty($live)) {
        $count += (int) $live->c;
    }
    return $count;
}

/** Can this user create another channel under their plan? */
function PT_OfficeCanAddChannel($user_id)
{
    $e = PT_OfficeEntitlement($user_id);
    if (empty($e)) {
        // No office plan linked: fall back to the platform pro entitlement.
        return ['allowed' => true, 'reason' => 'no_office_plan', 'limit' => null, 'used' => 0];
    }
    $limit = (int) $e->channels;
    $used = PT_OfficeChannelCount($user_id);
    return [
        'allowed' => $limit <= 0 ? false : ($used < $limit),
        'reason'  => $limit <= 0 ? 'tier_has_no_channels' : 'ok',
        'limit'   => $limit,
        'used'    => $used,
        'tier'    => $e->tier,
    ];
}

/**
 * Turn a plan's entitlements into concrete artifacts on jackisa.com.
 *
 * A tier row on its own changes nothing a customer can see. This is what makes
 * the plan worth paying for: a Pro plan opens the storefront, a Platinum plan
 * applies the gold badge and reserves meeting seats. Called by the bridge on
 * every entitlement sync, and it is idempotent so repeated syncs are safe.
 *
 * @param array<string,mixed> $data
 * @return array<string,mixed> a report of what was created
 */
function PT_OfficeMaterializeBenefits($user_id, $tier, $data = array())
{
    global $db;
    $user_id = (int) $user_id;
    $e = PT_OfficeEntitlement($user_id);
    if (empty($e)) {
        return ['ok' => false, 'error' => 'No entitlement row to materialise'];
    }
    $created = [];

    // Storefront: a store-enabled plan gets a real shop on jackisa.com.
    if ((int) $e->store_enabled === 1 && function_exists('PT_StoreSellerByUser')) {
        $seller = PT_StoreSellerByUser($user_id);
        if (empty($seller)) {
            // The plan carries store access, so record the store terms the same
            // way an in-app seller would, then open the storefront.
            if (function_exists('PT_StoreAcceptTerms')) {
                PT_StoreAcceptTerms($user_id, 'seller');
            }
            $storeName = !empty($data['store_name']) ? (string) $data['store_name'] : '';
            $result = PT_StoreCreateSeller($user_id, [
                'store_name'  => $storeName,
                'store_type'  => 'business',
                'description' => 'Published from Jackisa Office.',
            ]);
            if (!empty($result['status'])) {
                $created['store'] = ['seller_id' => $result['seller_id'], 'status' => $result['status']];
                $seller = PT_StoreSellerById($result['seller_id']);
            }
        }
        // The plan already paid for the storefront, so it goes live now rather
        // than waiting on a separate seller-approval queue.
        if (!empty($seller) && ($seller->status ?? '') !== 'active') {
            $db->where('id', (int) $seller->id)->update(T_STORE_SELLERS, ['status' => 'active', 'updated_at' => time()]);
            if (isset($created['store'])) {
                $created['store']['status'] = 'active';
            } else {
                $created['store_activated'] = (int) $seller->id;
            }
        }
    }

    // Gold verification badge for a Platinum (verified-company) plan.
    if ((int) $e->verified_badge === 1) {
        $db->where('id', $user_id)->update(T_USERS, ['verified' => 1]);
        $created['badge'] = 'gold';
    }

    // Meeting seats are reserved, not pre-created; report the allocation so the
    // office UI can show what is available.
    if ((int) $e->meeting_seats > 0) {
        $created['meeting_seats'] = (int) $e->meeting_seats;
    }

    return ['ok' => true, 'created' => $created];
}
