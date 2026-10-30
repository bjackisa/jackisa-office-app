<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\SsoService;
use Jackisa\Lic\Service\TenantService;

/**
 * /api/v1/auth — "Continue with Jackisa" and profile propagation.
 */
final class AuthController
{
    /**
     * POST /api/v1/auth/jackisa
     * Body: { access_token }. Returns a one-time sso_token + the profile
     * (including the jackisa.com avatar so office reuses the same photo).
     */
    public static function jackisa(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $accessToken = $request->string('access_token');
        if ($accessToken === '') {
            Response::error('422', 'access_token is required', 422);
        }

        $verified = SsoService::verifyJackisaToken($accessToken);
        if (empty($verified['ok'])) {
            Response::error('401', $verified['error'] ?? 'Jackisa authentication failed', 401);
        }

        $profile = $verified['profile'] ?? $verified['data'] ?? [];
        $app = App::instance();

        // Upsert the user into the central directory and mark individual KYC.
        $userId = TenantService::upsertUser([
            'email'          => $profile['email'] ?? '',
            'full_name'      => $profile['name'] ?? ($profile['username'] ?? 'User'),
            'phone'          => $profile['phone'] ?? null,
            'avatar_url'     => $profile['avatar'] ?? $profile['avatar_url'] ?? null,
            'jackisa_user_id' => (string) ($profile['id'] ?? $profile['jackisa_user_id'] ?? ''),
            'kyc_status'     => !empty($profile['verified']) ? 'verified' : 'unverified',
            'kyc_level'      => !empty($profile['verified']) ? 'individual' : 'none',
            'kyc_verified_at' => !empty($profile['verified']) ? date('Y-m-d H:i:s') : null,
        ]);

        $ssoToken = SsoService::mint([
            'jackisa_user_id' => (string) ($profile['id'] ?? ''),
            'email'           => strtolower((string) ($profile['email'] ?? '')),
            'full_name'       => $profile['name'] ?? 'User',
            'avatar_url'      => $profile['avatar'] ?? null,
            'phone'           => $profile['phone'] ?? null,
            'verified'        => !empty($profile['verified']),
            'lic_user_id'     => $userId,
        ]);

        Response::ok([
            'sso_token'  => $ssoToken,
            'expires_in' => 300,
            'profile'    => [
                'jackisa_user_id' => (string) ($profile['id'] ?? $profile['jackisa_user_id'] ?? ''),
                'email'      => strtolower((string) ($profile['email'] ?? '')),
                'full_name'  => $profile['name'] ?? 'User',
                'avatar_url' => $profile['avatar'] ?? null,
                'phone'      => $profile['phone'] ?? null,
                'verified'   => !empty($profile['verified']),
                'badge'      => !empty($profile['verified']) ? ['type' => 'individual', 'color' => 'blue', 'label' => 'Verified'] : null,
            ],
        ]);
    }

    /**
     * POST /api/v1/auth/sso-exchange
     * Body: { sso_token }. The office app (server-side) exchanges the one-time
     * token for the profile so it can create/link its Supabase user.
     */
    public static function ssoExchange(Request $request): void
    {
        Auth::requirePeer($request, ['office']);
        $token = $request->string('sso_token');
        if ($token === '') {
            Response::error('422', 'sso_token is required', 422);
        }
        $profile = SsoService::consume($token);
        if ($profile === null) {
            Response::error('401', 'This sign-in link has expired. Please try again.', 401);
        }
        Response::ok(['profile' => $profile]);
    }
}
