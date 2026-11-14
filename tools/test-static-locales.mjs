// SPDX-FileCopyrightText: 2026 The TotalDrop Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ROUTES, isRtlLocale, renderLocalizedPage, runStaticLocales } from "./static-locales.mjs";

const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

test("isRtlLocale identifies Arabic, Persian, Hebrew, and Urdu as RTL and Latin/CJK as LTR", () => {
  for (const rtl of ["ar", "fa", "he", "ur"]) {
    assert.equal(isRtlLocale(rtl), true, `expected ${rtl} to be RTL`);
  }
  for (const ltr of ["en", "tr", "de", "ja", "zh-Hans", "zh-Hant", "pt-BR"]) {
    assert.equal(isRtlLocale(ltr), false, `expected ${ltr} to be LTR`);
  }
});

test("renderLocalizedPage pre-renders RTL/LTR attributes, hreflang cluster, privacy link, and draft banner", () => {
  const templateHtml = readFileSync(join(PUB, "index.html"), "utf8");
  const enDict = JSON.parse(readFileSync(join(PUB, "i18n/en.json"), "utf8"));
  const trDict = JSON.parse(readFileSync(join(PUB, "i18n/tr.json"), "utf8"));
  const arDict = JSON.parse(readFileSync(join(PUB, "i18n/ar.json"), "utf8"));
  const languages = [
    ["ar", "العربية"],
    ["en", "English"],
    ["tr", "Türkçe"],
  ];
  const reviewed = ["en", "tr"];

  const trPage = renderLocalizedPage({
    templateHtml,
    route: ROUTES[0],
    tag: "tr",
    dict: trDict,
    enDict,
    languages,
    reviewed,
  });
  assert.match(trPage, /<html lang="tr" dir="ltr" data-static-locale="tr">/);
  assert.match(trPage, /<link rel="canonical" href="https:\/\/totaldrop\.app\/tr\/">/);
  assert.match(trPage, /<link rel="alternate" hreflang="x-default" href="https:\/\/totaldrop\.app\/">/);
  assert.match(trPage, /<link rel="alternate" hreflang="ar" href="https:\/\/totaldrop\.app\/ar\/">/);
  assert.match(trPage, /href="\/privacy\/tr" hreflang="tr"/);
  assert.match(trPage, /<p class="lang-note" role="note" hidden><\/p>/);

  const arPage = renderLocalizedPage({
    templateHtml,
    route: ROUTES[0],
    tag: "ar",
    dict: arDict,
    enDict,
    languages,
    reviewed,
  });
  assert.match(arPage, /<html lang="ar" dir="rtl" data-static-locale="ar">/);
  assert.match(arPage, /href="\/privacy\/ar" hreflang="ar"/);
  assert.doesNotMatch(arPage, /<p class="lang-note" role="note" hidden>/);
});

test("runStaticLocales check passes across all 245 generated locale pages", () => {
  const result = runStaticLocales({ pubDir: PUB, write: false });
  assert.deepEqual(result.stale, []);
  assert.equal(result.localeCount, 35);
  assert.equal(result.pageCount, 35 * ROUTES.length);
});
