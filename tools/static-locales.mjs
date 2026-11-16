// SPDX-FileCopyrightText: 2026 The TotalDrop Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Pre-renders static per-locale URLs (/ar/, /tr/, /tr/download/, ..., #513):
//   node tools/static-locales.mjs --check   verify all 35x7 static pages + sitemap
//   node tools/static-locales.mjs --write   generate/update public/<lang>/** + sitemap
//
// Search engines, social link previews, and no-JS readers get localized
// <html lang dir>, <title>, <meta name="description">, <link rel="canonical">,
// <link rel="alternate" hreflang="...">, translated body copy, and draft
// notices directly in static HTML, while public/app.js hydrates the language
// picker with zero initial network fetches.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const SITE_ORIGIN = "https://totaldrop.app";

export const ROUTES = [
  { src: "index.html", page: "home", subpath: "/", indexable: true },
  { src: "download/index.html", page: "download", subpath: "/download/", indexable: true },
  { src: "donate/index.html", page: "donate", subpath: "/donate/", indexable: true },
  { src: "roadmap/index.html", page: "roadmap", subpath: "/roadmap/", indexable: true },
  { src: "brand/index.html", page: "brand", subpath: "/brand/", indexable: true },
  { src: "team/index.html", page: "team", subpath: "/team/", indexable: true },
  { src: "r/index.html", page: "receive", subpath: "/r/", indexable: false },
];

const RTL_SCRIPTS = ["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"];

export function isRtlLocale(tag) {
  try {
    return RTL_SCRIPTS.includes(new Intl.Locale(tag).maximize().script);
  } catch {
    return false;
  }
}

export function escText(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escAttr(str) {
  return escText(str).replace(/"/g, "&quot;");
}

function loadLangMetadata(pubDir = PUB) {
  const sandbox = { Intl };
  vm.runInNewContext(readFileSync(join(pubDir, "lang.js"), "utf8"), sandbox);
  return sandbox.TDLang;
}

function hasText(dict, key) {
  return typeof dict[key] === "string" && dict[key] !== "";
}

export function renderLocalizedPage({ templateHtml, route, tag, dict, enDict, languages, reviewed }) {
  const dir = isRtlLocale(tag) ? "rtl" : "ltr";
  const tr = (key) => (hasText(dict, key) ? dict[key] : enDict[key]);

  let html = templateHtml;

  // 1. <html lang="..." dir="..." data-static-locale="...">
  html = html.replace(
    /<html\s+lang="en"\s*>/,
    `<html lang="${escAttr(tag)}" dir="${dir}" data-static-locale="${escAttr(tag)}">`,
  );

  // 2. <title>, <meta name="description">, and OpenGraph metadata
  const titleText = tr(`meta.${route.page}.title`);
  const descText = tr(`meta.${route.page}.desc`);
  if (typeof titleText === "string") {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(titleText)}</title>`);
    html = html.replace(
      /<meta\s+property="og:title"\s+content="[^"]*">/,
      `<meta property="og:title" content="${escAttr(titleText)}">`,
    );
  }
  if (typeof descText === "string") {
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*">/,
      `<meta name="description" content="${escAttr(descText)}">`,
    );
    html = html.replace(
      /<meta\s+property="og:description"\s+content="[^"]*">/,
      `<meta property="og:description" content="${escAttr(descText)}">`,
    );
  }

  // 3. Canonical URL + hreflang cluster
  const rootCanonicalPath = route.subpath === "/r/" ? "/r" : route.subpath;
  const canonicalUrl =
    tag === "en"
      ? `${SITE_ORIGIN}${rootCanonicalPath}`
      : `${SITE_ORIGIN}/${tag}${route.subpath}`;

  const alternates = [];
  if (route.indexable) {
    alternates.push(
      `  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${route.subpath}">`,
    );
    for (const [altTag] of languages) {
      const altHref =
        altTag === "en"
          ? `${SITE_ORIGIN}${route.subpath}`
          : `${SITE_ORIGIN}/${altTag}${route.subpath}`;
      alternates.push(`  <link rel="alternate" hreflang="${escAttr(altTag)}" href="${altHref}">`);
    }
  }
  const canonicalBlock = [
    `<link rel="canonical" href="${canonicalUrl}">`,
    ...alternates,
  ].join("\n");
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*">/, canonicalBlock);
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*">/,
    `<meta property="og:url" content="${SITE_ORIGIN}/${tag}${route.subpath}">`,
  );

  // 4. Accessible names: data-i18n-label="..." -> localized aria-label="..." (and non-empty alt="...")
  html = html.replace(/<([a-z0-9]+)\b[^>]*\bdata-i18n-label="([^"]+)"[^>]*>/g, (fullTag, _el, key) => {
    const label = tr(key);
    if (typeof label !== "string" || !/\baria-label="/.test(fullTag)) return fullTag;
    let updated = fullTag.replace(/\baria-label="[^"]*"/, `aria-label="${escAttr(label)}"`);
    if (/\balt="[^"]+"/.test(updated)) {
      updated = updated.replace(/\balt="[^"]*"/, `alt="${escAttr(label)}"`);
    }
    const isTranslated = tag === "en" || hasText(dict, key);
    if (!isTranslated && !/\blang="/.test(updated)) {
      updated = updated.slice(0, -1) + ' lang="en" dir="ltr">';
    }
    return updated;
  });

  // 5. Text content: data-i18n="..." -> localized inner text (preserving English lang/dir fallback)
  html = html.replace(
    /(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (full, openTag, _el, key, inner, closeTag) => {
      const text = tr(key);
      if (typeof text !== "string") return full;
      const isTranslated = tag === "en" || hasText(dict, key);
      let updatedOpen = openTag;
      if (!isTranslated && !/\blang="/.test(updatedOpen)) {
        updatedOpen = updatedOpen.slice(0, -1) + ' lang="en" dir="ltr">';
      }
      return `${updatedOpen}${escText(text)}${closeTag}`;
    },
  );

  // 6. Localize internal navigation, download, and privacy anchor (<a ...>) links
  html = html.replace(/<a\b[^>]*>/g, (anchorTag) => {
    let a = anchorTag
      .replace(/href="\/(roadmap|team|donate|brand|download)\/"/, `href="/${tag}/$1/"`)
      .replace(/href="\/"/, `href="/${tag}/"`)
      .replace(/href="https:\/\/totaldrop\.app\/(#(?:why|how|security))"/, `href="/${tag}/$1"`)
      .replace(/href="https:\/\/totaldrop\.app\/"/, `href="/${tag}/"`)
      .replace(/href="https:\/\/download\.totaldrop\.app\/"/, `href="/${tag}/download/"`);
    if (tag !== "en" && !/\bhreflang=/.test(a)) {
      a = a
        .replace(/href="\/privacy"/, `href="/privacy/${tag}" hreflang="${escAttr(tag)}"`)
        .replace(
          /href="https:\/\/totaldrop\.app\/privacy"/,
          `href="https://totaldrop.app/privacy/${tag}" hreflang="${escAttr(tag)}"`,
        );
    }
    return a;
  });

  // 7. Pre-render draft banner inside <main id="main"> for unreviewed locales
  const isReviewed = reviewed.includes(tag);
  const draftText = tr("lang.draft") || "This translation is a draft and is being reviewed.";
  const hasNativeDraft = tag === "en" || hasText(dict, "lang.draft");
  const draftAttrs = isReviewed
    ? ' class="lang-note" role="note" hidden'
    : hasNativeDraft
      ? ' class="lang-note" role="note"'
      : ' class="lang-note" role="note" lang="en" dir="ltr"';
  const draftNote = `<p${draftAttrs}>${isReviewed ? "" : escText(draftText)}</p>`;
  html = html.replace(/<main id="main">/, `<main id="main">\n    ${draftNote}`);

  return html;
}

export function buildExpectedSitemap(currentSitemap, languages) {
  // Keep non-locale base + privacy URLs, and deterministically manage localized page URLs.
  const tagSet = new Set(languages.map(([t]) => t));
  const keptLines = [];
  for (const line of currentSitemap.split("\n")) {
    const m = /<loc>https:\/\/totaldrop\.app\/([^<]+)<\/loc>/.exec(line);
    if (m) {
      const firstSeg = m[1].split("/")[0];
      if (tagSet.has(firstSeg)) continue;
    }
    if (line.trim() === "</urlset>" || line.trim() === "") continue;
    keptLines.push(line);
  }
  for (const [tag] of languages) {
    if (tag === "en") continue;
    for (const route of ROUTES) {
      if (!route.indexable) continue;
      keptLines.push(`  <url><loc>${SITE_ORIGIN}/${tag}${route.subpath}</loc></url>`);
    }
  }
  keptLines.push("</urlset>");
  return keptLines.join("\n") + "\n";
}

export function runStaticLocales({ pubDir = PUB, write = false } = {}) {
  const { LANGUAGES, REVIEWED } = loadLangMetadata(pubDir);
  const tags = LANGUAGES.map(([t]) => t);
  const enDict = JSON.parse(readFileSync(join(pubDir, "i18n", "en.json"), "utf8"));
  const templates = new Map(
    ROUTES.map((r) => [r.src, readFileSync(join(pubDir, r.src), "utf8")]),
  );

  const stale = [];
  let pageCount = 0;

  for (const tag of tags) {
    const dict =
      tag === "en"
        ? enDict
        : JSON.parse(readFileSync(join(pubDir, "i18n", `${tag}.json`), "utf8"));

    for (const route of ROUTES) {
      const want = renderLocalizedPage({
        templateHtml: templates.get(route.src),
        route,
        tag,
        dict,
        enDict,
        languages: LANGUAGES,
        reviewed: REVIEWED,
      });
      const outPath = join(pubDir, tag, route.src);
      pageCount++;
      if (write) {
        mkdirSync(dirname(outPath), { recursive: true });
        if (!existsSync(outPath) || readFileSync(outPath, "utf8") !== want) {
          writeFileSync(outPath, want);
        }
      } else if (!existsSync(outPath) || readFileSync(outPath, "utf8") !== want) {
        stale.push(`public/${tag}/${route.src}`);
      }
    }
  }

  // Detect any leftover locale directory that is no longer in LANGUAGES
  const reservedDirs = new Set(["assets", "brand", "donate", "download", "fonts", "i18n", "privacy", "r", "roadmap", "team", ".well-known"]);
  for (const entry of readdirSync(pubDir)) {
    const full = join(pubDir, entry);
    if (!statSync(full).isDirectory() || reservedDirs.has(entry)) continue;
    if (!tags.includes(entry)) {
      if (write) rmSync(full, { recursive: true, force: true });
      else stale.push(`public/${entry} (removed locale directory)`);
    }
  }

  const sitemapPath = join(pubDir, "sitemap.xml");
  const curSitemap = readFileSync(sitemapPath, "utf8");
  const wantSitemap = buildExpectedSitemap(curSitemap, LANGUAGES);
  if (curSitemap !== wantSitemap) {
    if (write) writeFileSync(sitemapPath, wantSitemap);
    else stale.push("public/sitemap.xml");
  }

  return { stale, pageCount, localeCount: tags.length };
}

function main() {
  const write = process.argv.includes("--write");
  const { stale, pageCount, localeCount } = runStaticLocales({ write });
  if (stale.length) {
    console.error(
      `error: static locale pages out of date (${stale.length} files); run: node tools/static-locales.mjs --write`,
    );
    for (const s of stale.slice(0, 20)) console.error(`  - ${s}`);
    process.exit(1);
  }
  console.log(
    `static locales ${write ? "written" : "ok"}: ${pageCount} pages across ${localeCount} languages`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
