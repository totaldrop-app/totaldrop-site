// SPDX-FileCopyrightText: 2026 The TotalDrop Contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Checks README.md (and optional translated READMEs in docs/readme/ when
// present), run in CI:
//   node tools/check-readmes.mjs          check
//   node tools/check-readmes.mjs --write  rewrite the language lists
//                                         (and the source marker of
//                                         translations given as args)
// - every relative link and image resolves to a file in the repository;
// - no direction or invisible control characters (ZWNJ only in Persian);
// - when docs/readme/ exists, every site language (public/lang.js) has
//   docs/readme/README.<tag>.md and carries the matching <!-- languages -->
//   list.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const box = { Intl };
vm.runInNewContext(read("public/lang.js"), box);
const { LANGUAGES } = box.TDLang;
const write = process.argv.includes("--write");
const stamp = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const errors = [];
const warnings = [];

const readmeDir = join(root, "docs", "readme");
const hasTranslations = existsSync(readmeDir);
const targets = hasTranslations ? LANGUAGES : [["en", "English"]];

const block = /<!-- languages -->[\s\S]*?<!-- \/languages -->/;
const fileOf = (tag) => (tag === "en" ? "README.md" : `docs/readme/README.${tag}.md`);
// The English first, so translations are stamped with the README.md as it
// will be committed.
if (write && existsSync(join(root, "README.md"))) {
  const en = read("README.md");
  if (block.test(en)) writeFileSync(join(root, "README.md"), en.replace(block, list("en")));
}
const source = existsSync(join(root, "README.md"))
  ? createHash("sha256").update(read("README.md")).digest("hex").slice(0, 12)
  : "";
const marker = (s) => `<!-- Translated from README.md ${s}. -->`;

function list(tag) {
  const from = dirname(fileOf(tag));
  const rel = (to) => {
    const up = from === "." ? "" : "../../";
    return to === "README.md" ? up + "README.md" : (from === "." ? to : to.replace("docs/readme/", ""));
  };
  const items = LANGUAGES.map(([t, name]) => (t === tag ? `**${name}**` : `[${name}](${rel(fileOf(t))})`));
  return `<!-- languages -->\n<sub>${items.join(" · ")}</sub>\n<!-- /languages -->`;
}

const forbidden = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

for (const [tag] of targets) {
  const path = fileOf(tag);
  if (!existsSync(join(root, path))) { errors.push(`${path}: missing`); continue; }
  let text = read(path);
  if (text.trim().length === 0) { errors.push(`${path}: empty`); continue; }
  if (hasTranslations) {
    if (!block.test(text)) { errors.push(`${path}: no <!-- languages --> list`); continue; }
    if (write) {
      text = text.replace(block, list(tag));
      if (tag !== "en" && stamp.includes(tag)) {
        text = text.replace(/^<!-- Translated from README\.md [0-9a-f]+\. -->\n/, "");
        text = marker(source) + "\n" + text;
      }
      writeFileSync(join(root, path), text);
    } else if (text.match(block)[0] !== list(tag)) {
      errors.push(`${path}: the language list differs (run with --write)`);
    }
  }
  if (tag !== "en") {
    const m = /^<!-- Translated from README\.md ([0-9a-f]{12})\. -->/.exec(text);
    if (!m) errors.push(`${path}: the first line must name the README.md it was translated from`);
    else if (m[1] !== source) warnings.push(`${path}: translated from an older README.md (${m[1]}, now ${source})`);
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Persian spelling needs ZWNJ; nothing else may hide in the text.
    const bad = (tag === "fa" ? line.replace(/\u200c/g, "") : line).replace(/\t/g, "");
    if (forbidden.test(bad)) errors.push(`${path}:${i + 1}: invisible or control character`);
  });
  // Relative links and images: [..](path), src="path", srcset="path".
  const dir = dirname(join(root, path));
  const refs = [...text.matchAll(/\]\(<?([^)\s>]+)>?\)|(?:src|srcset|href)="([^"]+)"|^\[[^\]]+\]:\s*(\S+)/gm)].map((x) => x[1] || x[2] || x[3]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|#)/.test(ref)) continue;
    const file = ref.split("#")[0];
    const target = resolve(dir, file);
    if (file && !target.startsWith(root + "/")) errors.push(`${path}: link to ${ref} leaves the repository`);
    else if (file && !existsSync(target)) errors.push(`${path}: link to ${ref} does not exist`);
  }
}

// A README for a language the site does not list.
if (hasTranslations) {
  for (const f of readdirSync(readmeDir)) {
    const m = /^README\.(.+)\.md$/.exec(f);
    if (!m || !LANGUAGES.some(([t]) => t === m[1])) errors.push(`docs/readme/${f}: not a site language (public/lang.js)`);
  }
}

for (const w of warnings) console.log(`::warning::${w}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
if (hasTranslations) {
  console.log(`READMEs ok: ${LANGUAGES.length} languages${warnings.length ? `, ${warnings.length} translations to update` : ""}`);
} else {
  console.log(`READMEs ok: README.md verified (${LANGUAGES.length} site languages in public/lang.js)`);
}
