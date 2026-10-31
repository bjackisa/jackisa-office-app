<?php
// +------------------------------------------------------------------------+
// | Jackisa Stream -> Jackisa License Hub bridge.
// | Deployed to jackisa.com/public_html/office_bridge.php
// |                                                                         |
// | Lets lic (and therefore Jackisa Office) authenticate a person with their |
// | jackisa.com account, reuse their jackisa.com profile photo, and — since  |
// | Jackisa One — carry a plan's benefits across both platforms:             |
// |   * sync_entitlements   office tier -> jackisa.com capabilities          |
// |   * entitlements        read a user's capabilities                       |
// |   * publish_course      an office school course -> a jackisa.com product |
// |   * schedule_meeting    an office meeting -> a jackisa.com live session  |
// |   * sync_member_channel a team member -> a jackisa.com channel seat      |
// |   * pull_store_earnings store money earned on jackisa.com -> office      |
// |   * apply_verification  a verified company/individual -> a badge         |
// +------------------------------------------------------------------------+
header_remove('Server');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/assets/init.php';
decryptConfigData();
require_once __DIR__ . '/office_entitlements.php';

// ---------------------------------------------------------------------------
// Shared secret with the licence hub. Kept in its own file so it can be
// rotated without touching config.php.
// ---------------------------------------------------------------------------
$bridgeSecretFile = __DIR__ . '/office_bridge_secret.php';
$bridgeSecret = is_file($bridgeSecretFile) ? trim((string) require $bridgeSecretFile) : '';
if ($bridgeSecret === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Bridge secret not configured']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$provided = $_SERVER['HTTP_X_LIC_SIGNATURE'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $raw, $bridgeSecret);
if ($provided === '' || !hash_equals($expected, $provided)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid signature']);
    exit;
}

$body = json_decode($raw, true);
if (!is_array($body)) {
    $body = $_POST;
}

$action = isset($body['action']) ? (string) $body['action'] : '';

function office_bridge_user_profile($row)
{
    $avatar = $row->avatar;
    if (function_exists('PT_GetMedia')) {
        $avatar = PT_GetMedia($row->avatar);
    }
    $name = trim(($row->first_name ?? '') . ' ' . ($row->last_name ?? ''));
    if ($name === '') {
        $name = $row->username;
    }
    return [
        'id'        => (int) $row->id,
        'username'  => $row->username,
        'name'      => $name,
        'email'     => $row->email,
        'phone'     => $row->phone_number ?? '',
        'avatar'    => $avatar,
        'verified'  => ((int) ($row->verified ?? 0)) === 1,
    ];
}

function office_bridge_respond($payload)
{
    echo json_encode($payload);
    exit;
}

if ($action === 'verify') {
    $token = isset($body['access_token']) ? trim((string) $body['access_token']) : '';
    if ($token === '') {
        office_bridge_respond(['ok' => false, 'error' => 'access_token is required']);
    }
    $session = $db->where('session_id', PT_Secure($token))->getOne(T_SESSIONS);
    if (empty($session) || empty($session->user_id)) {
        office_bridge_respond(['ok' => false, 'error' => 'Session does not exist']);
    }
    $row = $db->where('id', (int) $session->user_id)->getOne(T_USERS);
    if (empty($row)) {
        office_bridge_respond(['ok' => false, 'error' => 'User does not exist']);
    }
    if (function_exists('PT_UserActive') && PT_UserActive((int) $row->id) === false) {
        office_bridge_respond(['ok' => false, 'error' => 'Account is not active']);
    }
    office_bridge_respond(['ok' => true, 'profile' => office_bridge_user_profile($row)]);
}

if ($action === 'pull') {
    // Recent users for the central directory (idempotent upserts on the hub).
    $limit = isset($body['limit']) ? max(1, min(500, (int) $body['limit'])) : 200;
    $rows = $db->orderBy('id', 'DESC')->get(T_USERS, $limit);
    $out = [];
    foreach ($rows as $row) {
        $profile = office_bridge_user_profile($row);
        $profile['registered'] = $row->registered ?? null;
        $out[] = $profile;
    }
    office_bridge_respond(['ok' => true, 'users' => $out]);
}

if ($action === 'verify_username') {
    $username = isset($body['username']) ? PT_Secure((string) $body['username']) : '';
    $row = $db->where('username', $username)->getOne(T_USERS);
    if (empty($row)) {
        office_bridge_respond(['ok' => false, 'error' => 'Not found']);
    }
    office_bridge_respond(['ok' => true, 'profile' => office_bridge_user_profile($row)]);
}

// ---------------------------------------------------------------------------
// Jackisa One — cross-platform entitlements and benefits
// ---------------------------------------------------------------------------

if ($action === 'sync_entitlements') {
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $tier = isset($body['tier']) ? (string) $body['tier'] : 'basic';
    $result = PT_OfficeSetEntitlements($userId, $tier, $body);
    if (empty($result['status'])) {
        office_bridge_respond(['ok' => false, 'error' => $result['message'] ?? 'Could not store entitlements']);
    }
    office_bridge_respond([
        'ok'      => true,
        'user_id' => $userId,
        'tier'    => $result['row']->tier,
        'benefits' => PT_OfficeEntitlementBenefitLines($tier),
    ]);
}

if ($action === 'entitlements') {
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $e = PT_OfficeEntitlement($userId);
    if (empty($e)) {
        office_bridge_respond(['ok' => true, 'user_id' => $userId, 'entitlement' => null]);
    }
    office_bridge_respond([
        'ok'          => true,
        'user_id'     => $userId,
        'entitlement' => [
            'tier'                  => $e->tier,
            'plan_code'             => $e->plan_code,
            'channels'              => (int) $e->channels,
            'live_minutes'          => (int) $e->live_minutes,
            'store_enabled'         => (int) $e->store_enabled,
            'store_publish_courses' => (int) $e->store_publish_courses,
            'verified_badge'        => (int) $e->verified_badge,
            'meeting_seats'         => (int) $e->meeting_seats,
            'member_seats'          => (int) $e->member_seats,
            'features'              => json_decode((string) $e->features, true) ?: [],
            'status'                => $e->status,
        ],
        'benefits' => PT_OfficeEntitlementBenefitLines($e->tier),
    ]);
}

if ($action === 'apply_verification') {
    // Individuals verified on jackisa.com stay verified; a verified company
    // (gold) is applied to the owner's jackisa.com account.
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $badge = isset($body['badge']) ? (string) $body['badge'] : 'individual';
    $verified = !empty($body['verified']) ? 1 : 0;
    if ($badge === 'company' || $verified) {
        $db->where('id', $userId)->update(T_USERS, ['verified' => 1]);
    } elseif ($badge === 'individual' && !$verified) {
        // Never silently un-verify someone who earned it on jackisa.com itself.
        $current = $db->where('id', $userId)->getOne(T_USERS, ['verified']);
        if (empty($current) || (int) $current->verified !== 1) {
            $db->where('id', $userId)->update(T_USERS, ['verified' => 0]);
        }
    }
    office_bridge_respond(['ok' => true, 'user_id' => $userId, 'badge' => $badge, 'verified' => $verified]);
}

if ($action === 'publish_course') {
    // An office school course becomes a digital product in the owner's
    // jackisa.com store, so the same course can be sold on both platforms.
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $e = PT_OfficeEntitlement($userId);
    if (empty($e) || !(int) $e->store_publish_courses) {
        office_bridge_respond(['ok' => false, 'error' => 'This plan cannot publish courses to the store']);
    }
    $seller = PT_StoreSellerByUser($userId);
    if (empty($seller)) {
        // Create a storefront on first publish so the course has a home.
        $created = PT_StoreCreateSeller($userId, [
            'store_name'  => isset($body['store_name']) ? (string) $body['store_name'] : '',
            'store_type'  => 'business',
            'description' => 'Courses and services published from Jackisa Office.',
        ]);
        if (empty($created['status'])) {
            office_bridge_respond(['ok' => false, 'error' => $created['message'] ?? 'Could not open a store']);
        }
        $seller = PT_StoreSellerById($created['seller_id']);
    }

    $title = isset($body['title']) ? trim((string) $body['title']) : '';
    if ($title === '') {
        office_bridge_respond(['ok' => false, 'error' => 'A course title is required']);
    }
    $slug = PT_StoreSlug($title, 0, T_STORE_PRODUCTS, 'slug');
    $price = isset($body['price']) ? (float) $body['price'] : 0;
    $productId = $db->insert(T_STORE_PRODUCTS, [
        'seller_id'    => (int) $seller->id,
        'user_id'      => $userId,
        'category_id'  => isset($body['category_id']) ? (int) $body['category_id'] : 0,
        'kind'         => 'product',
        'product_type' => 'digital',
        'title'        => PT_Secure($title),
        'slug'         => $slug,
        'description'  => isset($body['description']) ? PT_Secure((string) $body['description']) : '',
        'sku'          => PT_StoreGenerateSku('product'),
        'price'        => $price,
        'currency'     => PT_StoreCurrency(),
        'status'       => 'active',
        'created_at'   => time(),
        'updated_at'   => time(),
    ]);
    if (empty($productId)) {
        office_bridge_respond(['ok' => false, 'error' => 'Could not create the product']);
    }
    office_bridge_respond([
        'ok'         => true,
        'product_id' => (int) $productId,
        'store_slug' => $seller->store_slug,
        'product_url' => 'https://jackisa.com/product/' . $slug,
    ]);
}

if ($action === 'sync_member_channel') {
    // "Anyone on a single team in office can manage a single channel here."
    // Grants one of the plan's channel seats to a team member.
    $ownerId = PT_OfficeEntitlementResolveUser($body);
    if ($ownerId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com owner account']);
    }
    $e = PT_OfficeEntitlement($ownerId);
    if (empty($e) || (int) $e->channels <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'This plan has no channel seats']);
    }
    $memberEmail = isset($body['member_email']) ? trim((string) $body['member_email']) : '';
    if ($memberEmail === '') {
        office_bridge_respond(['ok' => false, 'error' => 'member_email is required']);
    }
    $member = $db->where('email', PT_Secure($memberEmail))->getOne(T_USERS, ['id']);
    if (empty($member)) {
        office_bridge_respond(['ok' => false, 'error' => 'That team member has no jackisa.com account yet']);
    }
    $can = PT_OfficeCanAddChannel($ownerId);
    if (empty($can['allowed'])) {
        office_bridge_respond(['ok' => false, 'error' => 'Channel limit reached', 'limit' => $can['limit'], 'used' => $can['used']]);
    }
    office_bridge_respond([
        'ok'        => true,
        'member_id' => (int) $member->id,
        'seat'      => $can['used'] + 1,
        'limit'     => $can['limit'],
    ]);
}

if ($action === 'schedule_meeting') {
    // An office meeting becomes a live session on jackisa.com (live_imports),
    // so a Platinum tenant can host it with the platform's live stack.
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $e = PT_OfficeEntitlement($userId);
    if (empty($e) || (int) $e->meeting_seats <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'Live meetings are a Platinum benefit']);
    }
    $title = isset($body['title']) ? trim((string) $body['title']) : 'Jackisa Live meeting';
    $id = $db->insert(T_LIVE_IMPORTS, [
        'owner_id'    => $userId,
        'source_type' => 'meeting',
        'provider'    => 'office',
        'source_ref'  => isset($body['meeting_id']) ? (string) $body['meeting_id'] : ('mtg-' . uniqid()),
        'is_live'     => 0,
        'keep_after_end' => 1,
        'created_at'  => time(),
        'updated_at'  => time(),
    ]);
    if (empty($id)) {
        office_bridge_respond(['ok' => false, 'error' => 'Could not create the meeting']);
    }
    office_bridge_respond([
        'ok'         => true,
        'meeting_id' => (int) $id,
        'title'      => $title,
        'join_url'   => 'https://jackisa.com/live/' . (int) $id,
    ]);
}

if ($action === 'pull_store_earnings') {
    // Money earned by a tenant's storefront on jackisa.com, so office can show
    // the consolidated position.
    $userId = PT_OfficeEntitlementResolveUser($body);
    if ($userId <= 0) {
        office_bridge_respond(['ok' => false, 'error' => 'No matching jackisa.com user']);
    }
    $seller = PT_StoreSellerByUser($userId);
    if (empty($seller)) {
        office_bridge_respond(['ok' => true, 'earnings' => [], 'total' => 0]);
    }
    $limit = isset($body['limit']) ? max(1, min(500, (int) $body['limit'])) : 200;
    $rows = $db->where('seller_id', (int) $seller->id)->orderBy('id', 'DESC')->get(T_STORE_EARNINGS, $limit);
    $out = [];
    $total = 0.0;
    foreach ($rows as $r) {
        $net = (float) $r->net;
        $total += $net;
        $out[] = [
            'id'         => (int) $r->id,
            'order_id'   => (int) $r->order_id,
            'gross'      => (float) $r->gross,
            'commission' => (float) $r->commission,
            'net'        => $net,
            'currency'   => $r->currency,
            'status'     => $r->status,
            'created_at' => (int) $r->created_at,
        ];
    }
    office_bridge_respond(['ok' => true, 'seller_id' => (int) $seller->id, 'earnings' => $out, 'total' => $total]);
}

echo json_encode(['ok' => false, 'error' => 'Unknown action']);
