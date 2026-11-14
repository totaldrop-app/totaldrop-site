# TotalDrop Web Site (`totaldrop-site`)

Standalone static web site repository for [TotalDrop](https://totaldrop.app), synced with upstream commit `ebe2b19`. It powers `totaldrop.app`, `download.totaldrop.app`, QR/share links (`https://totaldrop.app/r#<code>`), the brand and team pages, and the 35-language privacy policy.

The site has no build step at deploy time, sets no cookies, makes zero third-party requests, and serves its own SIL OFL 1.1 fonts directly from `public/fonts/`.

## Repository Layout

```text
totaldrop-site/
  public/                              Static site published verbatim by Cloudflare Pages
    index.html                         Home page (English source text; client-side i18n via data-i18n)
    download/index.html                Download page; highlights the visitor's platform card
    donate/index.html                  Donation and sponsorship page
    roadmap/index.html                 Product roadmap page
    brand/index.html                   Brand guidelines and downloadable mark/logo assets
    brand/files/                       Generated SVG and PNG brand assets (tools/brand-files.mjs)
    team/index.html                    Team and discipline breakdown rendered from team/github.json
    team/avatars/                      Self-hosted GitHub avatars (browsers never contact github.com)
    r/index.html                       Share/QR receiver page; reads #<code> in the browser only
    privacy.html                       Authoritative English privacy policy (/privacy)
    privacy/<tag>.html                 Translated privacy policy pages in the other 34 languages
    404.html                           Not-found page (prevents SPA fallback 200 responses)
    styles.css                         Aurora design tokens, light/dark themes, accessible select colours
    lang.js                            35-language registry, reviewed list, BCP 47 negotiation
    msg.js                             ICU-subset message parser and formatter
    app.js                             Translation application, draft notice, platform detection, /r flow
    i18n/<tag>.json                    UI translations for all 35 supported languages
    fonts/                             Self-hosted Bricolage Grotesque and Atkinson Hyperlegible (OFL 1.1)
    .well-known/assetlinks.json        Android App Links verification statement (#445)
    .well-known/security.txt           RFC 9116 vulnerability disclosure policy (#450)
    _headers                           Strict CSP, HSTS, Referrer-Policy, COOP/CORP, Content-Type overrides
    _routes.json                       Cloudflare Pages Function routing exclusions
    favicon.svg, favicon.ico,          Theme-aware SVG mark, 16/32/48 px ICO, and 180 px iOS icon
    apple-touch-icon.png
    robots.txt, sitemap.xml            Crawler policy and full localized URL index
  functions/
    _middleware.js                     301 redirect www -> apex; rewrite download.totaldrop.app/ -> /download/
  privacy/<tag>.html                   Source <article> bodies for all 35 privacy policy languages
  team/
    team.json                          Curated team roles, translated bios (#408), and discipline paths
    github.json                        Offline snapshot of public GitHub profiles and commit counts
  tools/                               Zero-dependency Node.js verification, generation, and SPDX checks
  vendor/                              Vendored upstream manifests and assets for standalone verification
  REUSE.toml                           REUSE 3.3 copyright and license annotations
  SECURITY.md                          Security vulnerability reporting policy
  wrangler.toml                        Cloudflare Pages project configuration ("totaldrop")
```

## Security, Routing, and Well-Known Endpoints

### Strict Content Security Policy and Headers ([`public/_headers`](public/_headers))

Every response carries a locked-down security header policy:

- `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests` (with a narrow `style-src 'unsafe-inline'` override solely on `/favicon.svg` so its dark-mode `@media` rule renders).
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`, `Cross-Origin-Opener-Policy: same-origin`, and `Cross-Origin-Resource-Policy: same-origin`.
- No inline styles or scripts are permitted in HTML pages; dynamic SVG bar widths on the team page use presentation attributes rather than `style=""`, and `<select>` `<option>` elements declare explicit `background-color` and `color` tokens for dark-theme legibility ([`tools/test-select-colours.mjs`](tools/test-select-colours.mjs), `#293`).

### Cloudflare Pages Routing ([`public/_routes.json`](public/_routes.json) and [`functions/_middleware.js`](functions/_middleware.js))

One Cloudflare Pages project serves `totaldrop.app`, `www.totaldrop.app` (301 redirect to `totaldrop.app`), and `download.totaldrop.app` (root rewritten to `/download/`). [`public/_routes.json`](public/_routes.json) restricts Function execution strictly to HTML page navigation by excluding `/fonts/*`, `/brand/files/*`, `/team/avatars/*`, `/i18n/*`, `/styles.css`, `/app.js`, `/lang.js`, `/msg.js`, `/favicon.*`, `/apple-touch-icon.png`, `/robots.txt`, `/.well-known/*`, and `/sitemap.xml` without overlapping or duplicate rules.

### Android App Links (`assetlinks.json`, `#445`)

[`public/.well-known/assetlinks.json`](public/.well-known/assetlinks.json) delegates `delegate_permission/common.handle_all_urls` for `https://totaldrop.app/r` to the Android package `app.totaldrop` and its SHA-256 signing certificate fingerprint. Because `/.well-known/*` is excluded in [`public/_routes.json`](public/_routes.json), Android's verifier receives a direct HTTP `200` `application/json` response with no redirects. [`tools/test-assetlinks.mjs`](tools/test-assetlinks.mjs) verifies package parity, SHA-256 fingerprint format, the `android:autoVerify="true"` intent filter for `https://totaldrop.app/r`, and `flutter_deeplinking_enabled="false"` against [`vendor/android/build.gradle.kts`](vendor/android/build.gradle.kts) and [`vendor/android/AndroidManifest.xml`](vendor/android/AndroidManifest.xml).

### Vulnerability Disclosure (`security.txt`, `#450`)

[`public/.well-known/security.txt`](public/.well-known/security.txt) publishes TotalDrop's RFC 9116 disclosure metadata (`mailto:security@totaldrop.app` and GitHub private vulnerability reporting), served directly as `text/plain; charset=utf-8` via [`public/_headers`](public/_headers). [`tools/test-security-txt.mjs`](tools/test-security-txt.mjs) ensures channel parity with [`SECURITY.md`](SECURITY.md) and checks that `Expires` is a valid future RFC 3339 timestamp less than 365 days ahead.

## 35-Language Parity and Deterministic Asset Versioning

- **UI Localization ([`tools/check-i18n.mjs`](tools/check-i18n.mjs)):** Validates all 35 `public/i18n/<tag>.json` catalogs against [`public/lang.js`](public/lang.js), [`vendor/l10n/status.json`](vendor/l10n/status.json), shared ICU message vectors ([`vendor/l10n/tests/messages.json`](vendor/l10n/tests/messages.json)), and language negotiation vectors ([`vendor/l10n/tests/negotiation.json`](vendor/l10n/tests/negotiation.json)). Ensures English HTML `data-i18n` / `data-i18n-label` strings match `en.json`, blocks invisible directional/control characters or injected links/markup, and enforces version-number parity across translations.
- **Privacy Policy Lockstep ([`tools/privacy.mjs`](tools/privacy.mjs)):** Generates [`public/privacy.html`](public/privacy.html) and `public/privacy/<tag>.html` from `privacy/<tag>.html`. Every non-English source file starts with `<!-- Translated from en.html <12-hex-sha256>. -->` and must match English heading/paragraph/list structure, links, `<code>` blocks, Linux paths, version strings, and numbers, with automatic `<bdi dir="ltr">` isolation on RTL pages and full `sitemap.xml` coverage.
- **Cache-Busted Assets ([`tools/asset-versions.mjs`](tools/asset-versions.mjs), `#291`):** Appends `?v=<10-hex-sha256>` to every page's `/styles.css`, `/app.js`, `/lang.js`, and `/msg.js` references so visitors never render new HTML against cached scripts or stylesheets.
- **Icons, Brand Files, and Team Snapshot:** [`tools/favicons.mjs`](tools/favicons.mjs) checks `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, and [`vendor/logo.svg`](vendor/logo.svg); [`tools/brand-files.mjs`](tools/brand-files.mjs) verifies all 7 SVGs and 5 PNGs in `public/brand/files/` against [`vendor/app.totaldrop.TotalDrop.svg`](vendor/app.totaldrop.TotalDrop.svg) and [`tools/png-sources.json`](tools/png-sources.json); [`tools/team.mjs`](tools/team.mjs) verifies [`public/team/index.html`](public/team/index.html) and `public/team/avatars/` offline against [`team/team.json`](team/team.json), [`team/github.json`](team/github.json), and [`vendor/repo-paths.json`](vendor/repo-paths.json).

## Verification Commands

Run all checks and unit tests from the repository root (Node.js 22+):

```bash
node tools/asset-versions.mjs --check
node tools/privacy.mjs --check
node tools/check-i18n.mjs
node tools/favicons.mjs
node tools/brand-files.mjs
node tools/team.mjs
node tools/check-readmes.mjs
node --test tools/test-*.mjs
./tools/check-spdx.sh
```

When editing stylesheets, scripts, or privacy policy sources, regenerate committed outputs with `--write`:

```bash
node tools/asset-versions.mjs --write
node tools/privacy.mjs --write
```

## Licensing

- Site source, scripts, and templates: **GPL-3.0-or-later** ([`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)).
- Vendored localization test vectors (`vendor/l10n/`): **MIT OR Apache-2.0** ([`LICENSES/MIT.txt`](LICENSES/MIT.txt), [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)).
- Self-hosted fonts (`public/fonts/`): **SIL Open Font License 1.1** ([`LICENSES/OFL-1.1.txt`](LICENSES/OFL-1.1.txt)).
- Team profile avatars (`public/team/avatars/`): [`LICENSES/LicenseRef-TotalDrop-Team-Avatars.txt`](LICENSES/LicenseRef-TotalDrop-Team-Avatars.txt).
