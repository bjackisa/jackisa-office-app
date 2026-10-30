<?php
declare(strict_types=1);

/**
 * Jackisa License Hub — front controller.
 * All /api/v1/* traffic is rewritten here by .htaccess.
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Jackisa\Lic\App;
use Jackisa\Lic\Controller\AuthController;
use Jackisa\Lic\Controller\CatalogController;
use Jackisa\Lic\Controller\KycController;
use Jackisa\Lic\Controller\LicenseController;
use Jackisa\Lic\Controller\MessagingController;
use Jackisa\Lic\Controller\PaymentController;
use Jackisa\Lic\Controller\ReportController;
use Jackisa\Lic\Controller\SyncController;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Http\Router;

$app = App::boot();

// ---------------------------------------------------------------------------
// Security headers (applied to every response).
// ---------------------------------------------------------------------------
if (!headers_sent()) {
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// ---------------------------------------------------------------------------
// CORS — only the known front-ends may call from a browser.
// ---------------------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = (array) $app->config('cors.allowed_origins', []);
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Api-Key, X-Api-Secret, X-Lic-Signature, X-Lic-Peer, X-License-Key');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$request = Request::fromGlobals();

// A tiny index route so a human hitting the root sees something useful.
if ($request->path() === '/' || $request->path() === '/index.php') {
    Response::ok([
        'service' => 'Jackisa License Hub',
        'docs'    => 'https://lic.jackisa.com/api/v1',
        'version' => '1.0',
    ]);
}

$router = new Router();

// ---- Health ---------------------------------------------------------------
$router->get('/api/v1/health', fn(Request $r) => SyncController::health($r));

// ---- Licence --------------------------------------------------------------
$router->post('/api/v1/office-license/issue',    fn(Request $r) => LicenseController::issue($r));
$router->post('/api/v1/office-license/activate', fn(Request $r) => LicenseController::activate($r));
$router->post('/api/v1/office-license/validate', fn(Request $r) => LicenseController::validate($r));
$router->post('/api/v1/office-license/renew',    fn(Request $r) => LicenseController::renew($r));
$router->post('/api/v1/office-license/revoke',   fn(Request $r) => LicenseController::revoke($r));
$router->post('/api/v1/office-license/suspend',  fn(Request $r) => LicenseController::suspend($r));
$router->post('/api/v1/office-license/trial',    fn(Request $r) => LicenseController::trial($r));
$router->any('/api/v1/office-license/status',    fn(Request $r) => LicenseController::status($r));
$router->get('/api/v1/office-license/plans',     fn(Request $r) => LicenseController::plans($r));

// ---- Payments -------------------------------------------------------------
$router->post('/api/v1/jpesa-payments/initiate', fn(Request $r) => PaymentController::initiate($r));
$router->post('/api/v1/jpesa-payments/status',   fn(Request $r) => PaymentController::status($r));
$router->post('/api/v1/jpesa-payments/history',  fn(Request $r) => PaymentController::history($r));
$router->post('/api/v1/jpesa-payments/fee',      fn(Request $r) => PaymentController::fee($r));
$router->any('/api/v1/jpesa-payments/callback',  fn(Request $r) => PaymentController::callback($r));
$router->get('/api/v1/jpesa-payments/channels',  fn(Request $r) => PaymentController::channels($r));

// ---- Messaging / OTP ------------------------------------------------------
$router->post('/api/v1/mail/send',    fn(Request $r) => MessagingController::mail($r));
$router->post('/api/v1/mail',         fn(Request $r) => MessagingController::mail($r));
$router->get('/api/v1/mail/log',      fn(Request $r) => MessagingController::log($r));
$router->post('/api/v1/whapi/send',   fn(Request $r) => MessagingController::whatsapp($r));
$router->post('/api/v1/whapi',        fn(Request $r) => MessagingController::whatsapp($r));
$router->post('/api/v1/otp/issue',    fn(Request $r) => MessagingController::otpIssue($r));
$router->post('/api/v1/otp/verify',   fn(Request $r) => MessagingController::otpVerify($r));

// ---- Auth / SSO -----------------------------------------------------------
$router->post('/api/v1/auth/jackisa',      fn(Request $r) => AuthController::jackisa($r));
$router->post('/api/v1/auth/sso-exchange', fn(Request $r) => AuthController::ssoExchange($r));

// ---- Reports (compute + PDF delivery) -------------------------------------
$router->post('/api/v1/reports/income-tax',     fn(Request $r) => ReportController::incomeTax($r));
$router->post('/api/v1/reports/income-tax/csv', fn(Request $r) => ReportController::incomeTaxCsv($r));
$router->post('/api/v1/reports/fund-nav',       fn(Request $r) => ReportController::fundNav($r));
$router->post('/api/v1/reports/dividends',      fn(Request $r) => ReportController::dividends($r));
$router->post('/api/v1/reports/pdf',            fn(Request $r) => ReportController::pdf($r));

// ---- KYC / verification badges --------------------------------------------
$router->post('/api/v1/kyc/verify',   fn(Request $r) => KycController::verify($r));
$router->post('/api/v1/kyc/reject',   fn(Request $r) => KycController::reject($r));
$router->get('/api/v1/kyc/badge',     fn(Request $r) => KycController::badge($r));
$router->post('/api/v1/kyc/auto',     fn(Request $r) => KycController::auto($r));

// ---- Admin: package/feature catalogue (API-key protected) ------------------
$router->post('/api/v1/admin/plans',    fn(Request $r) => CatalogController::plans($r));
$router->post('/api/v1/admin/features', fn(Request $r) => CatalogController::features($r));

// ---- Sync -----------------------------------------------------------------
$router->post('/api/v1/sync/push',   fn(Request $r) => SyncController::push($r));
$router->post('/api/v1/sync/pull',   fn(Request $r) => SyncController::pull($r));
$router->get('/api/v1/sync/health',  fn(Request $r) => SyncController::health($r));

$router->dispatch($request);
