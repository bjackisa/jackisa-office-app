<?php
// +------------------------------------------------------------------------+
// | Jackisa Stream -> Jackisa Office single sign-on entry point.
// | Deployed to jackisa.com/public_html/office_sso.php
// |
// | "Continue with Jackisa" lands here. If the visitor already has a
// | jackisa.com session we hand the session id back to the calling app, which
// | verifies it server-side (via the licence hub -> office_bridge.php) and
// | then mints its own session. If they are not signed in we send them to the
// | jackisa.com login page and return here afterwards.
// +------------------------------------------------------------------------+
header_remove('Server');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

require __DIR__ . '/assets/init.php';
decryptConfigData();

// Only these hosts may receive a session token. Anything else is refused so a
// crafted link cannot leak a jackisa.com session to a third party.
$allowedHosts = [
    'office.jackisa.com',
    'localhost',
    '127.0.0.1',
];

$redirect = isset($_GET['redirect']) ? trim((string) $_GET['redirect']) : '';
$target = null;
if ($redirect !== '') {
    $parts = parse_url($redirect);
    if (is_array($parts) && !empty($parts['host']) && in_array(strtolower($parts['host']), $allowedHosts, true)) {
        $scheme = strtolower($parts['scheme'] ?? 'https');
        if (in_array($scheme, ['http', 'https'], true)) {
            $target = $redirect;
        }
    }
}
if ($target === null) {
    $target = 'https://office.jackisa.com/auth/callback';
}

$selfUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'jackisa.com') . ($_SERVER['REQUEST_URI'] ?? '/office_sso.php');

// Not signed in on jackisa.com yet: bounce through the standard login page and
// come straight back to this same URL.
if (empty($pt->user) || empty($pt->user->id)) {
    header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? 'jackisa.com') . '/login?red=' . urlencode($selfUrl));
    exit;
}

// Confirm the session row exists and is live before handing it over.
$sessionId = '';
if (!empty($_SESSION['user_id'])) {
    $sessionId = (string) $_SESSION['user_id'];
}
if ($sessionId === '' && !empty($_COOKIE['user_id'])) {
    $sessionId = (string) $_COOKIE['user_id'];
}

$row = null;
if ($sessionId !== '') {
    $row = $db->where('session_id', PT_Secure($sessionId))->getOne(T_SESSIONS);
}
if (empty($row)) {
    // Stale session: mint a fresh one for this verified user, exactly as the
    // login flow does, so the handoff always carries a usable token.
    $sessionId = sha1((string) rand(11111, 99999)) . time() . md5(microtime());
    $db->insert(T_SESSIONS, [
        'user_id'          => $pt->user->id,
        'session_id'       => $sessionId,
        'platform_details' => function_exists('getBrowser') ? serialize(getBrowser()) : null,
        'time'             => time(),
    ]);
    $_SESSION['user_id'] = $sessionId;
}

$sep = strpos($target, '?') === false ? '?' : '&';
header('Location: ' . $target . $sep . 'access_token=' . urlencode($sessionId));
exit;
