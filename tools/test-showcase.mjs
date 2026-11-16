// SPDX-FileCopyrightText: 2026 The TotalDrop Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// node --test tools/test-showcase.mjs
//
// Checks the Mineral theme-color, color-scheme, and text-scale meta tags,
// zoom-safe fluid typography, shipped app showcase assets on the home page,
// repository link on "Read the code", and co-maintainer governance copy (#7).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pngSize } from "./favicons.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readBytes = (path) => readFileSync(new URL(path, root));

test("_routes.json excludes /assets/* so showcase screenshots bypass Functions", () => {
  const { exclude } = JSON.parse(read("public/_routes.json"));
  assert.equal(exclude.filter((rule) => rule === "/assets/*").length, 1);
  assert.equal(new Set(exclude).size, exclude.length, "no rule twice");
});

test("showcase screenshots match declared img width and height attributes", () => {
  const home = read("public/index.html");
  const imgs = [...home.matchAll(/<img\b[^>]*\bsrc="(\/assets\/[^"]+)"[^>]*>/g)];
  assert.deepEqual(
    imgs.map((m) => m[1]),
    ["/assets/android.png", "/assets/linux.png"],
  );
  for (const [tag, src] of imgs) {
    const w = Number(tag.match(/\bwidth="(\d+)"/)?.[1]);
    const h = Number(tag.match(/\bheight="(\d+)"/)?.[1]);
    const size = pngSize(readBytes(`public${src}`));
    assert.deepEqual(size, { width: w, height: h }, `${src} PNG dimensions match HTML attributes`);
  }
});

test("hero.source links directly to totaldrop-app/totaldrop", () => {
  const home = read("public/index.html");
  const match = home.match(/<a\b[^>]*\bdata-i18n="hero\.source"[^>]*>/);
  assert.ok(match, "hero.source link is present");
  assert.match(match[0], /\bhref="https:\/\/github\.com\/totaldrop-app\/totaldrop"/);
});

test("every HTML template sets Mineral theme-color, color-scheme, and text-scale meta tags", () => {
  const pages = [
    "index.html",
    "download/index.html",
    "donate/index.html",
    "roadmap/index.html",
    "brand/index.html",
    "team/index.html",
    "r/index.html",
    "404.html",
    "privacy.html",
    "tr/index.html",
    "ar/index.html",
  ];
  for (const page of pages) {
    const html = read(`public/${page}`);
    assert.match(
      html,
      /<meta name="color-scheme" content="light dark">/,
      `${page}: color-scheme meta`,
    );
    assert.match(
      html,
      /<meta name="text-scale" content="scale">/,
      `${page}: text-scale meta`,
    );
    assert.match(
      html,
      /<meta name="theme-color" content="#F7F7F5" media="\(prefers-color-scheme: light\)">/,
      `${page}: light theme-color`,
    );
    assert.match(
      html,
      /<meta name="theme-color" content="#0F1116" media="\(prefers-color-scheme: dark\)">/,
      `${page}: dark theme-color`,
    );
  }
});

test("styles.css uses zoom-safe rem+vw fluid font-size clamps and metric fallback adjustment", () => {
  const css = read("public/styles.css");
  assert.match(css, /font-size-adjust:\s*from-font;/);
  const clamps = [...css.matchAll(/font-size:\s*clamp\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(clamps.length >= 8, "expected fluid font-size clamp rules");
  for (const expr of clamps) {
    const parts = expr.split(",").map((s) => s.trim());
    assert.equal(parts.length, 3, `clamp(${expr}) has 3 arguments`);
    assert.match(parts[1], /rem\s*\+\s*[\d.]+vw/, `clamp(${expr}) preferred value mixes rem + vw`);
  }
});

test("team page governance copy reflects co-maintainer merges across English and pre-rendered locales", () => {
  const team = read("public/team/index.html");
  const trTeam = read("public/tr/team/index.html");
  const en = JSON.parse(read("public/i18n/en.json"));
  assert.doesNotMatch(team, /only the project lead can merge/i);
  assert.doesNotMatch(team, /Only the project lead merges/i);
  assert.match(en["tm.tools.lede"], /maintainer approves or merges every change/);
  assert.match(en["tm.how.h3"], /Maintainers merge reviewed changes/);
  assert.match(trTeam, /her değişikliği bir bakımcı onaylar ya da birleştirir/);
});
