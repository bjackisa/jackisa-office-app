# Jackisa.com — What Has Been Added or Changed (Jackisa One synergy)

This document records the changes made to the **jackisa.com** (PlayTube) codebase to
support the Jackisa One platform: the licence hub at `lic.jackisa.com` and the office
app at `office.jackisa.com`.

All new files live in the jackisa.com web root (`public_html/`).

## New files

| File | Purpose |
|------|---------|
| `office_bridge.php` | The one endpoint `lic.jackisa.com` calls. Every action is HMAC-signed with the shared bridge secret. Actions: `verify` (SSO session check), `pull` (user directory), `sync_entitlements`, `entitlements`, `materialize_benefits`, `publish_course`, `schedule_meeting`, `sync_member_channel`, `pull_store_earnings`, `apply_verification`. |
| `office_entitlements.php` | The entitlement engine. Maps a Jackisa One tier (basic / pro / platinum) to concrete platform limits: channels, live minutes, store enabled, course publishing, verified badge, meeting seats, member seats, feature flags. Also creates the real artifacts on purchase: storefront/seller, gold badge, reserved seats. |
| `office_sso.php` | "Continue with Jackisa" entry point. If the visitor has a jackisa.com session, it redirects to the office callback with a one-time `access_token`. If not, it bounces through the standard login page and returns. Only `office.jackisa.com`, `localhost` and `127.0.0.1` may receive the token. |
| `office_bridge_secret.php` | **Never committed.** Holds the shared HMAC secret. Listed in `.gitignore`. |
| `lic_cron.php` | Hosting-panel cron entry that runs the licence hub's scheduled jobs twice a day. |

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

## Changed files

| File | Change |
|------|--------|
| `themes/playtag/layout/header/loggedin.html` | Added a "Jackisa Office" link to the user menu. Signed-in users go through `office_sso.php` so the office app signs them in without a second password. |
| `themes/playtag/layout/header/not-logged.html` | Added a "Jackisa Office" link for guests, pointing at `office.jackisa.com`. |

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
