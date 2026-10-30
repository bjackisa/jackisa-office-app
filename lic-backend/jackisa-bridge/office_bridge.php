<?php
// +------------------------------------------------------------------------+
// | Jackisa Stream -> Jackisa License Hub bridge.
// | Deployed to jackisa.com/public_html/office_bridge.php
// | Lets lic (and therefore Jackisa Office) authenticate a person with their
// | jackisa.com account and reuse their jackisa.com profile photo.
// +------------------------------------------------------------------------+
header_remove('Server');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/assets/init.php';
decryptConfigData();

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

if ($action === 'verify') {
    $token = isset($body['access_token']) ? trim((string) $body['access_token']) : '';
    if ($token === '') {
        echo json_encode(['ok' => false, 'error' => 'access_token is required']);
        exit;
    }
    $session = $db->where('session_id', PT_Secure($token))->getOne(T_SESSIONS);
    if (empty($session) || empty($session->user_id)) {
        echo json_encode(['ok' => false, 'error' => 'Session does not exist']);
        exit;
    }
    $row = $db->where('id', (int) $session->user_id)->getOne(T_USERS);
    if (empty($row)) {
        echo json_encode(['ok' => false, 'error' => 'User does not exist']);
        exit;
    }
    if (function_exists('PT_UserActive') && PT_UserActive((int) $row->id) === false) {
        echo json_encode(['ok' => false, 'error' => 'Account is not active']);
        exit;
    }
    echo json_encode(['ok' => true, 'profile' => office_bridge_user_profile($row)]);
    exit;
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
    echo json_encode(['ok' => true, 'users' => $out]);
    exit;
}

if ($action === 'verify_username') {
    $username = isset($body['username']) ? PT_Secure((string) $body['username']) : '';
    $row = $db->where('username', $username)->getOne(T_USERS);
    if (empty($row)) {
        echo json_encode(['ok' => false, 'error' => 'Not found']);
        exit;
    }
    echo json_encode(['ok' => true, 'profile' => office_bridge_user_profile($row)]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unknown action']);
