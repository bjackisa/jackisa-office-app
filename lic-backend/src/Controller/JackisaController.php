<?php
declare(strict_types=1);

namespace Jackisa\Lic\Controller;

use Jackisa\Lic\App;
use Jackisa\Lic\Http\Request;
use Jackisa\Lic\Http\Response;
use Jackisa\Lic\Middleware\Auth;
use Jackisa\Lic\Service\JackisaBridgeService;

/**
 * /api/v1/jackisa — the Jackisa One cross-platform surface.
 *
 * The office app calls these (signed peer) to make things happen on jackisa.com
 * on a tenant's behalf: publish a course to the store, schedule a live meeting,
 * seat a team member on a channel, read the plan's benefits, or pull store
 * earnings back into office. The hub owns the bridge secret; the office app
 * never talks to jackisa.com directly.
 */
final class JackisaController
{
    /** GET|POST /api/v1/jackisa/benefits — what a plan unlocks on jackisa.com. */
    public static function benefits(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        if ($email === '') {
            Response::error('422', 'A tenant or email is required', 422);
        }
        $result = JackisaBridgeService::entitlements($email);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('502', $result['error'] ?? 'Could not read jackisa.com benefits', 502);
    }

    /** POST /api/v1/jackisa/sync — push a tenant's tier to jackisa.com. */
    public static function sync(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        $result = JackisaBridgeService::syncEntitlements($tenantId);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('502', $result['error'] ?? 'Could not sync to jackisa.com', 502);
    }

    /** POST /api/v1/jackisa/publish-course — office course -> jackisa store. */
    public static function publishCourse(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        $title = $request->string('title');
        if ($email === '' || $title === '') {
            Response::error('422', 'A tenant/email and a course title are required', 422);
        }
        $result = JackisaBridgeService::publishCourse($email, [
            'title'       => $title,
            'description' => $request->string('description'),
            'price'       => $request->string('price', '0'),
            'category_id' => $request->int('category_id', 0),
            'store_name'  => $request->string('store_name'),
        ]);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('422', $result['error'] ?? 'Could not publish the course', 422);
    }

    /** POST /api/v1/jackisa/meeting — office meeting -> jackisa live session. */
    public static function meeting(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        if ($email === '') {
            Response::error('422', 'A tenant or email is required', 422);
        }
        $result = JackisaBridgeService::scheduleMeeting($email, [
            'title'      => $request->string('title', 'Jackisa Live meeting'),
            'meeting_id' => $request->string('meeting_id'),
        ]);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('422', $result['error'] ?? 'Could not schedule the meeting', 422);
    }

    /** POST /api/v1/jackisa/member-channel — seat a team member on a channel. */
    public static function memberChannel(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        $memberEmail = $request->string('member_email');
        if ($email === '' || $memberEmail === '') {
            Response::error('422', 'A tenant/email and member_email are required', 422);
        }
        $result = JackisaBridgeService::syncMemberChannel($email, $memberEmail, $request->string('member_name'));
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('422', $result['error'] ?? 'Could not seat the team member', 422);
    }

    /** POST /api/v1/jackisa/store-earnings — pull jackisa store earnings. */
    public static function storeEarnings(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        if ($email === '') {
            Response::error('422', 'A tenant or email is required', 422);
        }
        $result = JackisaBridgeService::pullStoreEarnings($email, $request->int('limit', 200));
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('502', $result['error'] ?? 'Could not read store earnings', 502);
    }

    /** POST /api/v1/jackisa/verification — mirror a badge onto jackisa.com. */
    public static function verification(Request $request): void
    {
        Auth::requirePeer($request);
        $email = self::resolveEmail($request);
        if ($email === '') {
            Response::error('422', 'A tenant or email is required', 422);
        }
        $badge = $request->string('badge', 'individual');
        $verified = (bool) $request->int('verified', 1);
        $result = JackisaBridgeService::applyVerification($email, $badge, $verified);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('502', $result['error'] ?? 'Could not update the badge', 502);
    }

    /** POST /api/v1/jackisa/materialize — create storefront/badge/seats. */
    public static function materialize(Request $request): void
    {
        Auth::requirePeer($request);
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            Response::error('422', 'tenant_id is required', 422);
        }
        $result = JackisaBridgeService::materializeBenefits($tenantId);
        $result['ok'] ?? false
            ? Response::ok($result)
            : Response::error('502', $result['error'] ?? 'Could not materialise the plan benefits', 502);
    }

    /** Resolve the owner email from either an explicit email or a tenant id. */
    private static function resolveEmail(Request $request): string
    {
        $email = strtolower(trim($request->string('email')));
        if ($email !== '') {
            return $email;
        }
        $tenantId = $request->string('tenant_id');
        if ($tenantId === '') {
            return '';
        }
        $tenant = App::instance()->one('SELECT email FROM tenants WHERE id = ?', [$tenantId]);
        return strtolower(trim((string) ($tenant['email'] ?? '')));
    }
}
