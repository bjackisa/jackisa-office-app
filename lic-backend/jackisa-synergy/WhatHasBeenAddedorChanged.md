# Jackisa.com — What Has Been Added or Changed (Jackisa One synergy)

This document records the changes made to the **jackisa.com** (PlayTube) codebase to
support the Jackisa One platform: the licence hub at `lic.jackisa.com` and the office
app at `office.jackisa.com`.

All new files live in the jackisa.com web root (`public_html/`).

## New files

| File | Purpose |
|------|---------|
| `office_bridge.php` | The one endpoint `lic.jackisa.com` calls. Every action is HMAC-signed with the shared bridge secret. Actions: `verify` (SSO session check), `pull` (user directory), `verify_username`, `sync_entitlements`, `entitlements`, `materialize_benefits`, `publish_course`, `schedule_meeting`, `sync_member_channel`, `pull_store_earnings`, `apply_verification`. |
| `office_entitlements.php` | The entitlement engine. Maps a Jackisa One tier (basic / pro / platinum) to concrete platform limits: channels, live minutes, store enabled, course publishing, verified badge, meeting seats, member seats, feature flags. Also creates the real artifacts on purchase: storefront/seller, gold badge, reserved seats. |
| `office_sso.php` | "Continue with Jackisa" entry point. If the visitor has a jackisa.com session, it redirects to the office callback with a one-time `access_token`. If not, it bounces through the standard login page and returns. Only `office.jackisa.com`, `localhost` and `127.0.0.1` may receive the token. |
| `office_bridge_secret.php` | **Never committed.** Holds the shared HMAC secret. Listed in `.gitignore`. |
| `lic_cron.php` | Hosting-panel cron entry that runs the licence hub's scheduled jobs twice a day. |
| `WhatHasBeenAddedorChanged.md` | This document. |

## New database table

`office_entitlements` — one row per jackisa.com user, keyed by `user_id`.
SQL: `jackisa_one_entitlements.sql`.

| Column | Meaning |
|--------|---------|
| `user_id` | jackisa.com user id |
| `tier` | `basic` / `pro` / `platinum` |
| `plan_code` | e.g. `pro_12m` |
| `lic_tenant_id` | the office company's licence tenant |
| `channels`, `live_minutes`, `store_enabled`, `store_publish_courses` | platform caps |
| `verified_badge`, `meeting_seats`, `member_seats` | benefits |
| `features` | JSON feature flags |
| `status` | `active` / `suspended` |

## Entitlement materialization

A tier row on its own changes nothing a customer can see, so
`PT_OfficeMaterializeBenefits($user_id, $tier, $data)` turns a plan into real
artifacts on jackisa.com. It is idempotent, so repeated syncs are safe.

| Entitlement | Artifact created |
|-------------|------------------|
| `store_enabled` | Opens the seller storefront (accepts the store terms, creates the seller if missing) and sets it `active` immediately — the plan already paid for it, so it does not wait on the seller-approval queue. |
| `verified_badge` | Applies the gold verification badge (`users.verified = 1`). |
| `meeting_seats` | Reports the reserved seat allocation so the office UI can show availability. |

The bridge calls this on every `sync_entitlements`, and the dedicated
`materialize_benefits` action re-runs it on demand.

## Changed files

| File | Change |
|------|--------|
| `themes/playtag/layout/header/loggedin.html` | Added a "Jackisa Office" link to the user menu. Signed-in users go through `office_sso.php` so the office app signs them in without a second password. |
| `themes/playtag/layout/header/not-logged.html` | Added a "Jackisa Office" link for guests, pointing at `office.jackisa.com`. |
| `office_bridge.php` | `sync_entitlements` now calls `PT_OfficeMaterializeBenefits` and returns what it created; new `materialize_benefits` action; `entitlements` now returns `store_slug` / `store_url` so the office app can deep-link to the live storefront. |
| `office_entitlements.php` | Added `PT_OfficeMaterializeBenefits()` — the storefront / badge / seats materializer described above. |
| `.well-known/assetlinks.json` | Added the newest Android signing-certificate fingerprint so office / jackisa.com deep links keep resolving after the app signing key changed. |

## How it works end to end

1. A company buys a plan on `office.jackisa.com`.
2. The office app tells `lic.jackisa.com`, which issues a licence (SSL-shaped
   certificate) and pushes the tenant's tier to jackisa.com over the signed bridge.
3. `office_entitlements.php` writes the tier's caps into `office_entitlements` and
   **materializes** the real artifacts: it opens and activates the storefront, applies
   the gold verification badge, and reserves meeting seats.
4. The office app validates its licence twice a day. If the company is over its caps
   or the licence lapsed, the app locks; otherwise it stays open.

## Security notes

* The bridge secret is shared only between `lic.jackisa.com` and `jackisa.com`. The
  office app never talks to jackisa.com directly.
* Every bridge call carries `X-Lic-Signature` (HMAC-SHA256 over the raw body) and is
  rejected if the signature does not match.
* `office_sso.php` refuses to hand a session token to any host outside the allow-list.

## Licensing flow fixes (office + licence hub)

Two defects in the office sign-up / licensing flow, fixed together.

| Where | Change |
|-------|--------|
| `office.jackisa.com` — `lib/lic/provision.ts` (new) | `ensureLicTenant()` pushes a company to the hub as a tenant (with its owner user and owner membership) before the hub is asked to start a trial or charge a licence. The hub enforces a foreign key from `trials` / `licenses` / `subscriptions` to `tenants`, but the office app previously never told the hub about a new company, so the first trial insert failed the constraint and the hub returned an HTTP 500. The tenant id is the office company id — the same value every licence call already passes as `tenant_id` — and the id is remembered on `companies.lic_tenant_id` so later calls take the fast path. |
| `office.jackisa.com` — `app/api/trial/route.ts`, `app/api/lic/license/route.ts`, `app/api/lic/payments/route.ts` | Call `ensureLicTenant()` before the hub call. |
| `office.jackisa.com` — `lib/lic/serverAuth.ts` | `getMembership()` now falls back to the company's `created_by` / `owner_user_id` when there is no active `company_employees` row, so a company owner is always treated as an admin member. Without this, an owner whose membership row was missing or not yet active was told "Not signed in" when paying for a licence. |
| `lic.jackisa.com` — `TenantService::ensureTenant()` (new) | Idempotent tenant upsert that never clobbers a richer record already on file. `LicenseService::issue()` and `startTrial()` call it first, so a request that arrives ahead of the office sync can no longer fail the foreign key. |

Note: the office fixes had been committed but not deployed — the live site was serving
a build that both omitted the tenant provisioning and called the licence routes without
the caller's token, which is what surfaced as "Not signed in" while signed in. The
office app was redeployed with these changes.

