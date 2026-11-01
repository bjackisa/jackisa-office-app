# Jackisa Stream — project memory

## Jackisa Office — notification engine (Oct 31) — see `.openhands/memory/2026-10-31.md`
- **The hub `/api/v1/notify` rail is the one place every office module sends through.**
  The app posts *facts* (tenant, event, dedupe_key, recipients, optional `document`),
  the hub renders an HTML→PDF via Dompdf, stores it, attaches it to email + WhatsApp
  and de-duplicates. Office entry point: `POST /api/notify/event` → `lib/notify/events.ts`.
  Always call it with `apiJson()` (the route needs the Supabase bearer).
- **Every module now auto-notifies** (no manual "send"): HR points, payroll payslips,
  invoices, dividends, payments webhook, sales receipts, leave requested/decided,
  helpdesk tickets, education marks. Recipients resolve server-side — a caller may only
  notify within a company they belong to; `notifyCompanyAdmins` fans out to admins.
- **PDFs: never use a remote logo.** `DocumentService::shell()` always draws a monogram
  of the workspace initials. Footer reads "Generated in Jackisa Office" + a package badge
  resolved by `DocumentService::packageName($tenantId)` (joins `licenses`→`plans`).
- **Dompdf IS installed on lic** (`vendor/dompdf`, `pdf.dompdf_autoload` in
  `config/config.local.php`) → full CSS renders. Verify a PDF by downloading it and
  rasterising with PyMuPDF, not by reading bytes.
- Hub deploy = `scp` file to `~/domains/lic.jackisa.com/app/src/…` + `php -l` on the
  server (no local php). A standalone hub script needs `App::boot()` after
  `require bootstrap.php`.
- **Documents use one design system** (ink spine + brass hairline full-bleed on every
  page, Source Serif 4 display over Public Sans, hairline tables, dark summary strip,
  status = text + colour). Dompdf traps learned the hard way: a `* { margin:0 }` reset
  **silently wipes the `@page` margin** (scope the reset to content elements);
  `position:fixed` repeats per page but anchors to the content box, so full-bleed needs
  negative offsets matching the `@page` margins; no flex/grid/pseudo-elements; gradients
  don't paint. Fonts need a **writable** font dir — `PdfService::prepareFontDir()` points
  Dompdf at `storage/fonts` (seeded from the package metrics) and registers the brand
  TTFs; a family with no 400 face makes 400 text fall back to Times. Preview gallery:
  https://lic.jackisa.com/preview/index.html (harness `/tmp/preview.php` on the host).

## Jackisa Office — account-targeted coupons (Oct 30) — see `.openhands/memory/2026-10-30.md`
- **Coupons are hub-authoritative.** Operator mints a coupon (percent / flat amount / full
  waiver / bonus days) scoped to one account, a list, or a group (new, legacy, country,
  industry, kind, tier); a code or auto-apply; duration once/N/forever; cap + expiry.
  `CouponService` decides eligibility against the live `tenants` row and prices it;
  `PaymentService::initiate` re-prices any `coupon_code` itself. A fully-covered plan is a
  zero-amount `payments` row (`status='paid'`) via `redeemFreeLicense`.
- Hub: `migrations/008_coupons.sql`, `src/Service/CouponService.php`,
  `src/Controller/CouponController.php`, routes `/api/v1/coupons/{available,validate,quote}`
  (peer) + `/api/v1/admin/coupons` (admin key). Office: `/app/admin/coupons` console,
  `/api/admin/coupons` + `/api/lic/coupons`, coupon UI on `/app/settings/billing`,
  `scripts/office-coupons-v1.sql`.
- **Peer signing:** HMAC-SHA256 over the raw JSON body → `X-Lic-Signature: sha256=<hex>`,
  `X-Lic-Peer: office`; secret = `peers.office.shared_secret` in the hub's
  `config/config.local.php`. Handy for live API tests without the app.
- **Hub deploy:** the server tree is `~/domains/lic.jackisa.com/app`; the local
  `jackisa-license-hub` repo mirrors it. scp changed files, then `php bin/migrate.php`
  (migrations are tracked in `_migrations`; `ADD COLUMN IF NOT EXISTS` works — MariaDB 11.8).
  **PHP is not in the local shell** — lint/run over SSH.
- **Supabase SQL apply:** no psql locally; run `scripts/*.sql` through a pg8000 script that
  strips `--` comments and splits on `;` (creds cached at `/tmp/pg_creds.json`).

## Jackisa Office — trial/pay auth fixes (Oct 31) — see `.openhands/memory/2026-10-31.md`
- **Trial 500 = missing hub tenant.** `trials.tenant_id` FK → `tenants.id`; the office app
  never pushed new companies to the hub. Fix: `lib/lic/provision.ts` `ensureLicTenant()`
  (called before trial/payment) + hub `TenantService::ensureTenant()`. **The office company
  id IS the hub tenant id.**
- **"Not signed in" while signed in = app was 17 commits behind origin/main.** The auth +
  `apiFetch`-token fix (`7a0be62`) was committed but never deployed. Always confirm the live
  build matches `origin/main` (probe a protected route: it must 401 without a token).
- `getMembership()` now falls back to `companies.created_by`/`owner_user_id` → the owner is
  always an admin member.

## Jackisa Office — repos & deployment (Oct 31) — see `.openhands/memory/2026-10-31.md`
- **Repos:** `bjackisa/jackisastream` (jackisa.com, private), `bjackisa/jackisa-office-app`
  (this app, public), **new** `bjackisa/jackisa-license-hub` (lic app, private) = `lic-backend/`
  contents at repo root (`bin/ config/ src/ migrations/ public_html/`). `src/` is the live
  tree; the server also has stale duplicate top-level dirs (unused, not in the repo).
- lic doc root `~/domains/lic.jackisa.com/public_html/` is a shim → `../app/public_html/index.php`;
  the repo deploys to `.../app/`.
- **Deployment gap:** server `src/Service/CronService.php` + `public_html/.htaccess` are older
  than the pushed repo — server needs a redeploy of those two files.
- **Tokens:** workspace `GITHUB_TOKEN` (fine-grained) pushes jackisastream + office-app but
  cannot create repos; the server's classic `~/.git-credentials` token can. Push with
  `git -c credential.helper= push https://bjackisa:<token>@github.com/...`.

## Jackisa Office — ledger / unit-trust / legacy backfill (Oct 31) — see `.openhands/memory/2026-10-31.md`
- **Fund money never hit the double-entry ledger.** `process_contribution/redemption/
  process_sale_to_fund_allocation` moved `cash_pool` + `fund_transactions` only.
  `scripts/office-unit-trust-ledger-v2.sql` re-wires all three to post balanced
  journals (only net enters the pool) + adds `jo_distribute_dividend`. Keep the
  signatures byte-identical to the originals or `CREATE OR REPLACE` fails.
- **`dividends.updated_at` was missing** though `sync_dividend_financials` writes it
  → every dividend payment insert failed. Added in `office-ledger-trust-hardening-v1.sql`.
- Apply order matters: `licensing-and-platform-v1.sql` (defines `jo_is_company_member`)
  must precede `industry-education-and-documents-v1.sql` and `payroll-ledger-and-trust-v1.sql`.
  Whole set: `scripts/apply-office-sql.sh` (needs `SUPABASE_DB_URL`; office uses Supabase
  REST, not a direct DB connection).
- `office-backfill-legacy-v1.sql` + `lic-backend/migrations/006_backfill_legacy.sql`
  adapt pre-ledger / pre-subscription rows. Hub backfill applied live (`php bin/migrate.php`).
- Validate with throwaway Postgres + MariaDB containers; Postgres needs Supabase role
  shims (`anon/authenticated/service_role`, `auth.uid()`), MariaDB needs `mariadb db < file`.

## Jackisa Office (Oct 2026) — see `.openhands/memory/2026-10-30.md`
- **Messaging: mirror jackisa.com.** Every transactional message goes out on email
  AND WhatsApp concurrently. `lib/lic/notify.ts` `notify()` (Promise.all) is the entry
  point; `lib/lic/html-to-text.ts` flattens the email HTML for the WhatsApp copy;
  `lib/lic/messages.ts` holds the branded templates. Whapi.Cloud is the WhatsApp rail
  (lic `/api/v1/whapi/send`), same SMTP via lic `/api/v1/mail/send`.
- **Invites were created but never sent.** The team page inserted
  `employee_invitations` and nothing emailed. It now calls the
  `create_invite` API (`app/api/companies/members`), which mints a
  `company_invite_links` token and emails+WhatsApps the link. `decide_request` also
  notifies the applicant.
- **lic `CronService::remindTrials` read `u.phone` but the trial number is in
  `trials.msisdn`** — the WhatsApp reminder silently never fired; now
  `COALESCE(u.phone, t.msisdn)`. Renewal reminders also mirror to WhatsApp.
- **Feature gating failed for two separate reasons.** (1) `companies.kind` was never
  written by any code path, so business-type gating never fired — now set at signup
  (register page selector), in `/api/register/complete`, and in settings/company.
  (2) `company_role_features` had no UI — `app/app/settings/roles` now has a per-role
  feature-grant editor (upserts `company_role_features`).
- **A paid licence did not unlock the app**: the office never pulled the certificate lic
  issued after a settled payment. `lib/lic/mirror.ts` `mirrorLicenseFromHub()` mirrors
  `platform_licenses`; called from `app/api/lic/license` (issue/trial/renew) and
  `app/api/lic/payments` (status=paid re-pulls `licenseStatus`).
- **Blocker**: `LIC_OFFICE_SECRET` must be set in Vercel = lic `peers.office.shared_secret`,
  else office signs office→lic with an empty secret. Only the user can set it.
- Join/invite flow is already implemented: `/auth/join`, `app/api/companies/members`,
  `app/api/students/link`.
- **Education documents run on lic, not in the app.** The office app is serverless
  (no headless browser, no writable FS), so marks/report cards are rendered and sent
  by lic: `POST /api/v1/education/{notify-marks,transcript}` + `POST /api/v1/sync/student`.
  lic `Service/DocumentService.php` renders HTML→PDF (`PdfService::fromHtml`), stores
  under `app/storage/documents`, registers in `documents`, and serves it via the
  `public_html/documents` symlink. Office side: `lib/education/standings.ts`
  (50/50 coursework/exam, matches Grades), `app/api/education/{notify,student}`.
  Guardian phone/email on `students` (additive `scripts/education-documents-v1.sql`,
  also `document_deliveries`). Deploy lic by SFTP to `~/domains/lic.jackisa.com/app/`
  with `~/ops/upload.py`; run `php bin/migrate.php`. See `2026-10-30.md` for detail.

## Jackisa One — cross-platform benefits (Oct 2026)
- **One entitlement engine lives on jackisa.com**: `public_html/office_entitlements.php`
  (matrix basic/pro/platinum) + table `office_entitlements`. lic is the single
  writer: every licence mutation pushes the tenant's tier to jackisa.com
  (`LicenseController::pushEntitlements` -> `JackisaBridgeService::syncEntitlements`).
  Office never talks to jackisa.com directly — it goes through lic
  (`app/api/jackisa/route.ts` -> `lib/lic/client.ts` `jackisa*` -> lic `/api/v1/jackisa/*`).
  Benefits: channels, live minutes, store + course publishing, verified badge,
  meeting seats. `publish_course` turns an office school course into a jackisa.com
  store product; `schedule_meeting` -> a jackisa live session.
- **"Continue with Jackisa" must verify a token, not rely on the magic-link flow.**
  `/api/auth/jackisa/exchange` returns `tokenHash` and the callback calls
  `supabase.auth.verifyOtp({ token_hash, type:'email' })` — flow-independent.
  Verified live. Full chain: jackisa session -> `office_sso.php` -> lic
  `/api/v1/auth/jackisa` (profile+avatar) -> `/api/v1/auth/sso-exchange`.
- jackisa.com bridge secret is `office_bridge_secret.php` (**gitignored**); lic's
  copy is `peers.jackisa.shared_secret`. `office_bridge.php` requires the engine file.
- See `.openhands/memory/2026-10-30.md` (session 2) for gotchas.

## Articles (Oct 2026)
- Articles broke three ways (list 500, read 500, no mobile articles). Full detail
  in `.openhands/memory/2026-10-27.md`. Key points:
  - `pt_posts.time` is a **varchar**; never `date()` it, use `PT_ArticleTime()`.
  - Never build a raw `LIKE '%...%'` from a title: use `PT_SqlLikeValue()`
    (apostrophes break the query).
  - **The vendored joshcam `MysqliDb` leaked its WHERE clause after any failed
    query** (PHP 8 mysqli throws, so `reset()` was skipped), corrupting the next
    query on the shared `$db`. `_prepareQuery()` now resets before rethrowing.
    Trigger on live: `sql/jackisa_article_shortlinks.sql` (`pt_posts.short_id`)
    had not been applied. Run it on live.
  - Regression test: `php tests/articles_test.php`.

## WhatsApp providers (Oct 2026)
- Order is **Whapi.Cloud (primary) -> Meta Cloud API -> Blueticks -> AiSensy**,
  in `PT_WhatsAppSend()` (`assets/includes/whatsapp/module.php`). Whapi drives a
  real WhatsApp account, so the body goes out **verbatim** (greeting + name +
  link); Meta needs pre-approved templates. Full detail in
  `.openhands/memory/2026-10-24.md`.
- `assets/includes/whatsapp/whapi.php` = `PT_WhapiClient` +
  `PT_WhatsAppSendViaWhapi`. Token `$whapi_token` in `config.php`, base
  `https://gate.whapi.cloud/`. Media goes as a `data:<mime>;base64,<b64>` string.
  `to` must be bare digits (no `+`). `{"sent":false}` on HTTP 200 = failure.
- Whapi webhook = same endpoint `whatsapp_webhook.php?token=<secret>`; detected by
  `PT_WhatsAppWebhookIsWhapi` (no `object` field) **before** the Blueticks branch.
  `whatsapp_cron.php` wakes the channel (`GET /health?wakeup=true`) first.
- **The WhatsApp copy is polished, not the raw email** (`assets/includes/whatsapp/polish.php`,
  called by `PT_WhatsAppComposeBody()`): the header bar, subject echo, duplicated
  button link, signature footer and padding notes are dropped; the greeting and the
  `Label: value` detail lines are kept (the Meta backups grep them). An OTP becomes
  "Hello <name>," + "Your <purpose> code is <code>." + expiry note. polish.php needs
  meta.php's `PT_WhatsAppMetaExtractCode`, so it loads after meta.php.
  Callback URL to register with Whapi:
  `https://jackisa.com/whatsapp_webhook.php?token=6046fca8fb7e1d92c07aa864c285233f`;
  delivery log: `whatsapp_webhook.log` at the repo root.

## Environment (costly to rediscover)
- **PHP container (Jackisa Stream web app) is a separate session from the Android one.**
  PHP is not preinstalled: `sudo apt-get install -y php-cli php-bcmath php-mbstring php-curl`.
  `php-curl` matters — `tests/whatsapp_module_test.php` calls `curl_init` in its AiSensy
  section and dies with "Call to undefined function curl_init()" without it.
- Transactional email is **HTML** now (Oct 2026): `assets/includes/emails.php`
  `PT_EmailFrame()` builds the whole layout; every send site passes `is_html => true`.
  The WhatsApp copy flattens the same body, so detail rows must stay `Label: value`
  for the Meta template greps. See `.openhands/memory/2026-10-24.md`.
- `assets/includes/functions_one.php` and `yt_cron.php` are CRLF; editing tools
  normalise them to LF and balloon the diff — convert back before committing.
- gradle lives at `/workspace/tools/gradle-9.3.1/bin/gradle`; **not** on PATH.
- The container rotates between sessions and **wipes `/opt`**, so the JDK and Android SDK
  must be restored before any build. Working setup used in Oct 2026:
  - JDK: Temurin 17 -> `/workspace/tools/jdk` (`api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse`).
  - SDK: commandline-tools -> `/workspace/tools/android-sdk`, then
    `sdkmanager --sdk_root=... "platform-tools" "platforms;android-36" "build-tools;36.0.0"`.
  - `local.properties` must point `sdk.dir` at the SDK; it is git-ignored.
  - `unzip` is absent — extract with `python3 -c "import zipfile; zipfile.ZipFile(...).extractall(...)"`.
- Do **not** pass `--offline`: the Gradle plugin cache is also wiped, and
  `settings.gradle.kts` needs `org.gradle.toolchains.foojay-resolver-convention` from the network.
- Keystores are git-ignored; recreate `debug.keystore` / `my-upload-key.jks` with the
  `keytool` lines in AGENTS.md before `assembleDebug` / `assembleRelease`.
- No KVM -> no emulator. Verify by `gradle :app:compileDebugKotlin` + `assembleDebug` +
  `assembleRelease` + live API probes.
- Foreground terminal commands are capped ~1080s; run long builds with `nohup ... &` and poll.
- Live API probe helper: `/workspace/tools/jk` (`jk.call(type, query=..., body=...)`).
  It needs `pycryptodome`; without it, call the API directly with `urllib` +
  `server_key=11242b26dda33ee238b615e728469b83`. The stored `session.txt` is padded with
  `0x0E` bytes — strip with `tr -d '\016'` before use.

## Live API contract (verified, do not re-derive)
- Reads use the **uid** for `get_video_details`; numeric ids 404 there.
- All **writes** (`comments`, `like_dislike_video`, `watch_later`, `report_video`,
  `add_comment`, `video_time`, `get_video_comments`) require the **numeric id**.
  Use `JackisaRepository.numericVideoId()`.
- Channels are keyed by **user id** (`get_channel_info`, `get_videos_by_channel`,
  `popular_channels[].user_data.id`).
- `subscribe` success = `{"code":1}`. `channel_notify` wants `channel_id` in the body.
- Live status: a **fresh `live_time` heartbeat (> 0) is the only "on air" signal**. Verified
  live: a running YouTube import had `live_time` 43s old, `live_ended 0`, `is_live 1`,
  `is_still_live true`, while an ended import had `live_time 0`, `live_ended 1`. List
  payloads omit `is_live` entirely and set `live_ended: 0` even for finished imports, so
  reading `is_live` labelled everything "Live". `live_time` is a heartbeat, not a start
  time — never render an age from it; use `time_ago` (publish time). See `LiveStatus`.

## Layout rules learned
- Do **not** apply `WindowInsets.safeDrawing` to the app page container: it includes the
  IME and lifts the whole screen when a keyboard opens. Use
  `statusBars ∪ navigationBars ∪ displayCutout`; handle the IME per screen (`imePadding`).
- `AppShell(hidesNavigationBar = true)` gives a route the full window (used by the player
  and the conversation screen).

## Open work
All items from the Oct 2026 session are implemented and verified with a green
`assembleDebug` + `assembleRelease`. See `.openhands/memory/2026-10-20.md` for the log.
Remaining known gap: no emulator (no KVM), so UI behaviour is compile-verified only.
Auth-dependent work is deferred while the site has 2FA on.

### Oct 2026, sixth session (watch back button, article feed)
See `.openhands/memory/2026-10-23b.md`. Headlines:
- **The watch page's own back arrow goes home, not back.** It calls a new `onHome`
  (clears the back stack, `Destination.HOME`, `Route.Tabs`); the previous page is often
  another watch page. Minimise still calls `onBack`; the system `BackHandler` is untouched.
- **The articles tab is not the server's newest-first column.** `orderArticlesForFeed()`
  shuffles every visit and partitions read items last; `ArticleReadStore` (device-local
  SharedPreferences `jackisa_article_reads`) records opens. It survives sign-out on purpose.
- **The tab pages.** `loadMoreArticles()` appends the *new* page ordered at
  `offset = articlesFetched` and never reshuffles the whole list (rows would jump); a short
  page sets `articlesExhausted`. Trigger is `LaunchedEffect(lastVisibleIndex, articles.size,
  isExhausted)` over `listState.layoutInfo`, not a captured list value.
- `SharedPreferences` has no `putIntSet`; store the id set as `putStringSet`.
- Toolchain this session: JDK at `/workspace/tools/jdk-17.0.21+9`, **Gradle 9.3.1**
  (AGP 9.1.1 needs it), SDK at `/workspace/tools/android-sdk`.

### Oct 2026, fifth session (playback smoothness)
See `.openhands/memory/2026-10-23.md`. Headlines:
- **Playback smoothness was three separate bugs, not one.** `setItem` released and
  rebuilt the `ExoPlayer` per item (killed the decoders and buffer — cold black start,
  re-buffer on every mini-player / PiP return); the transport was driven by
  `player.isPlaying` (flipped to play on every buffer, and lagged a callback on each
  tap); and `overlayVisible` included `showBuffering` (redrew the whole chrome, time
  bar and all, on every stall — "the time bar on each buffer"). Fixes: reuse one
  player, publish from viewer intent, draw the spinner outside the chrome.
- **Route crossfades hold two `SurfaceView`s and the outgoing one disposes last.**
  Detaching unconditionally took the incoming surface away (black picture, no
  transport). `SessionHolder` now keeps a `liveSurfaces` list and re-applies the newest
  survivor. Never `release()` the surface by hand — `SurfaceView` does it itself.
- `PlaybackCache` (512 MB `SimpleCache` + `CacheDataSource`) is wired into the player,
  so replays and backwards seeks cost no network.
- `paused_time` is **seconds**; the player wants milliseconds. Re-entering the watch
  page must not re-`play(...)` an item already in the session — resume in place.
- `setVideoSurface` clashed with media3's `Player.setVideoSurface` overload on a `null`
  argument; renamed `attachSurfaceView`. `SliderDefaults.Track` (material3 1.3.0) has no
  `trackHeight` and needs `@OptIn(ExperimentalMaterial3Api::class)`.


### Oct 2026, fourth session (player polish, auth, wallet, preloading)
See `.openhands/memory/2026-10-22.md`. Headlines:
- **The flashing player controls were the auto-hide timer watching `isPlaying`.** Every
  buffer / re-prepare restarted the countdown. Key the countdown off an interaction counter
  (`hideRequest`), not off stream state; the opening chrome is a one-shot.
- Quality text must never be the raw provider name: `QualityLabel` folds to SD/HD/FHD/UHD
  and `resolveQualityLabel` keeps the last real label (startup reports `unknown`).
- **The player must not be a `LazyColumn` item.** Scrolling disposed it, detaching the
  surface, which both stopped the picture and killed the transport. Pin it in a `Column`
  above the list. `SessionHolder.detachVideoSurface` only detaches the current surface so a
  watch-page -> mini-player handover survives.
- Exiting full screen returns to the video page, not the feed; the player's PiP button is
  the in-app mini player, system PiP lives on the mini player.
- Live YouTube embeds are refused on datacenter IPs (error 150); `youtube.html` falls back
  to a plain provider iframe and the app yields its chrome via `providerControlled`.
- Wallet: JPesa is async; poll `type=status` (6 s, 1 h window) and never trust the
  callback. Web contract in `app_api/v1.0/platform/mobile/jpesa.php` + `wallet_info.php`.
- All 50 endpoint names the app calls exist on the server — no missing API to add.

### Oct 2026, third session (crash + polish)
See `.openhands/memory/2026-10-21.md`. Headlines:
- **The click-to-play crash was a broken custom `Timeline`.** `JackisaSessionPlayer`'s
  `SingleItemTimeline` returned its own stored `Window`/`Period` from `getWindow`/`getPeriod`
  instead of writing into the scratch objects media3 passes in. `Timeline.getPeriodPositionUs`
  ends with `checkNotNull(period.uid)`, so the first `setMediaItem` NPE'd inside
  `SimpleBasePlayer.getPositionDiscontinuityReason`. **A custom `Timeline` must populate the
  caller's Window/Period.** Regression tests: `playback/JackisaSessionPlayerTest.kt`
  (Robolectric, sdk 34); `getState()` is protected so assert on `currentSnapshot()`.
- Theme: `bootstrap()` re-forced dark on every launch. `SecurityManager.hasChosenTheme`
  gates the site's `night_mode` default; `toggleTheme()` sets it.
- Hero play button removed from `HomeScreen.HeroCard` (the card stays clickable;
  `VideoThumbnail.showPlayOverlay` defaults to false).
- Dock glass opacity/frost lives only in `JackisaColors.kt` glass tokens (both themes).

### Oct 2026, second session (playback + dock)
See `.openhands/memory/2026-10-21.md` for detail. Headlines:
- **Playback was broken by the player's own command set.** `SimpleBasePlayer.setMediaItems`
  early-returns unless `COMMAND_CHANGE_MEDIA_ITEMS` *or* `COMMAND_SET_MEDIA_ITEM` is in
  `availableCommands`, so the session silently ignored every `setMediaItem`. Adding
  `COMMAND_SET_MEDIA_ITEM` to `COMMANDS` in `JackisaSessionPlayer` is the fix. Keep
  `COMMAND_CHANGE_MEDIA_ITEMS` out: `MediaUtils` prefers the plural form when present and it
  would hit the unimplemented `handleChangeMediaItems` and throw.
- Embeds: YouTube -> drivable `assets/player/youtube.html`; every other provider ->
  `assets/player/generic.html` (plain iframe). Both are loaded with
  `loadDataWithBaseURL("https://jackisa.com/", ...)`; a `file://` origin gets error 153.
- **The dock must not be given reserved space.** If `AppShell` contributes a bottom
  `contentInsets`, the page background paints an opaque band above the dock. The shell
  contributes none; each scrolling screen pads its own content with `NavigationDockClearance`
  (`FloatingBarHeight + 28.dp`) instead. Apply it to every new scrolling screen.
- Nav colours are theme tokens now (`glassSurface/glassBorder/glassHighlight/glassShadow`),
  so the dock has a light-mode variant. Never reintroduce a hard-coded dock tint.
- View counts: `NumberFormat.views` (K/M from 5,000). Article dates:
  `DateTimeFormat.fromEpoch` -> "dd/MM/yyyy HH:mm".

### Oct 2026, sixth session (lic.jackisa.com licensing/payments/reports)
See `.openhands/memory/2026-10-30.md`. Headlines:
- **The served lic front controller is `app/public_html/index.php`**, not `app/index.php`.
  A stray `app/index.php` shadowed newly added routes (404 on /api/v1/reports/*) — deleted.
- **`crontab` does not exist on the host.** jackisa.com has one hPanel cron running
  `~/cron_runner/dispatcher.php`; add jobs there (`every_minutes`/`at`). A `lic` job
  (every 30 min) drives `lic_cron.php` -> `lic/bin/cron.php run-all`.
- lic jobs: licenses.expire, trials.remind, trials.expire, payments.reconcile, sync.pull,
  tax.snapshot, fund.snapshot, reminders.renewals. sync.pull pulled 40 jackisa users.
- Uganda corporate tax: `tax.presumptive_threshold` config (default 150m) → 1% below,
  30% above. Don't hard-code the band; Finance Acts move it.
- Reports/KYC live on lic: /api/v1/reports/{income-tax,income-tax/csv,fund-nav,dividends,pdf},
  /api/v1/kyc/{verify,reject,badge,auto}. PdfService is dependency-free (valid %PDF-1.4).
- `VerificationBadge` (blue individual / gold company) is in components/verification-badge.tsx
  and wired into app/app/layout.tsx header.

### Oct 2026, sixth session (legacy record editing + WhatsApp routing)
- **Legacy records were un-editable, not just incomplete.** `students` never had the
  `status` column the students + grades screens have always written to, so every
  status change failed silently; there was no `updated_at` either. Fixed by
  `scripts/office-legacy-record-editing-v1.sql` (adds both + a `jo_touch_updated_at`
  BEFORE UPDATE trigger, and replaces the world-writable `students_authenticated_*`
  RLS policies with `jo_is_company_member`-scoped ones).
- **Student edit dialog** (app/app/education/students/page.tsx) edits name, student
  number, email, WhatsApp, guardian name/phone/email, tuition, status; on save it
  re-publishes to the hub via `POST /api/education/student` (that route already took
  this exact payload). A "No contact" badge flags records a transcript can't reach.
- **Employee edit dialog** (app/app/hr/employees/page.tsx) edits name/email/phone
  (on `users`) plus id number, dept, position, role, salary (on `company_employees`);
  `loadEmployees` now also selects `users(phone)` and flags "No phone on record".
  Employees always have a `user_id`, so the name/phone live on `users`.
- **WhatsApp recipient routing, not suppression.** 0752567374 (Jolis's old
  `companies.phone` / hub `tenants.phone`) is remapped to 256742459007 — in office
  `lib/lic/notify.ts` (`resolveWhatsAppNumber`) and in hub
  `src/Service/WhatsAppService.php` (`resolveRecipient`, applied to `$to` at the top
  of `send`). Match on the last 9 digits so +256…/0…/256… all hit. The hub copy is the
  real chokepoint: every hub sender goes through `WhatsAppService::send`.
- Deploying the hub = `scp` the file to `~/domains/lic.jackisa.com/app/src/...`; test
  with `php -r 'require "src/bootstrap.php"; …'` on the server. Hub tenant phone is in
  MySQL `tenants.phone` (db `u388105230_jackisasynccp`), office company phone in
  Supabase `companies.phone`.


### Nov 2026 (URA e-filing + Vercel/pnpm + Supabase migration)
See `.openhands/memory/2026-11-01.md`. Headlines:
- **Vercel builds with pnpm, not npm.** The repo has both `pnpm-lock.yaml` and a stale
  `package-lock.json`; Vercel installs with `pnpm install --frozen-lockfile`, so **every
  dependency change must update `pnpm-lock.yaml`** or the deploy fails with
  `ERR_PNPM_OUTDATED_LOCKFILE`. There is no `packageManager` field, so Vercel picks
  pnpm@10 from the project creation date. Regenerate with
  `npx --yes pnpm@10.15.0 install --no-frozen-lockfile` (corepack can't symlink in this
  sandbox). Commit `pnpm-lock.yaml` only — leave `package-lock.json` alone.
- **The office app deploys on Vercel project `v0-jackisa-office-app`**
  (id `prj_qXjKBTF6eoFXxig9S9XSZycx5Doc`, prod alias `jackisaoffice.vercel.app`), not the
  hPanel cron host. Deployments: `GET /v6/deployments?projectId=…`, logs
  `GET /v3/deployments/<uid>/events?direction=forward`.
- **Applying office SQL to Supabase:** use the pooler (`aws-1-us-east-1.pooler.supabase.com:5432`,
  user `postgres.ieedycorfbowkubgwgcb`, pg8000). A naive `sql.split(';')` breaks on
  `$$` function bodies — use a real splitter that skips strings/comments/dollar-quotes.
  Wrap in one `begin`/`commit` (or `rollback` for a dry run).
- URA feature lives in `lib/ura/*` + `app/api/ura/*` + `app/app/accounting/ura`. Every
  return is rejected without a `companies.tin`; it is backfilled from `tax_id` and now
  editable on the URA screen (`/api/ura/taxpayer`) and in company settings.
- **The URA macro emits a compressed upload file that only its own VBA can produce** — a
  plain .xlsx is not accepted by the portal. The app therefore fills the template layout
  and validates; the user copies the figures into the official template, presses VALIDATE,
  then uploads. Don't claim the generated .xlsx uploads directly.
- Office schema gotchas that bit the collector: `accounting_accounts` uses
  `account_code`/`account_name` (not `code`/`name`); `payroll_records.employee_id`
  references `company_employees.id`; `salary_structures` also has `other_allowances`;
  `company_roles` has **no** `is_admin` column (admin = role/position name matches
  admin|owner|director|principal|manager, or the company owner).
