# Jackisa Stream — project memory

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
