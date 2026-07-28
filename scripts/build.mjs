/**
 * Build = verify, then assemble `dist/`.
 *
 * There is no bundler. Every module is served as-is, and every path in the app
 * is relative, so the same `dist/` works at `/` and at `/your-knowledge/`.
 * What this script buys us is the checks: a broken shell path, an accidental
 * absolute URL, or a leaked secret fails the build instead of failing in
 * someone's browser after deploy.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/** Files and directories that make up the deployed site. */
const SHIP = [
  ".nojekyll",
  "index.html",
  "styles.css",
  "sw.js",
  "manifest.webmanifest",
  "favicon.svg",
  "pwa-icon-192.png",
  "pwa-icon-512.png",
  "assets",
  "domain",
  "src",
];

/** Never deploy these, wherever they turn up. */
const NEVER_SHIP = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".local-media",
  "node_modules",
]);

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

const rel = (/** @type {string} */ p) =>
  path.relative(root, p).split(path.sep).join("/");

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (NEVER_SHIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// ------------------------------------------------------------------ checks ---

function checkShipListExists() {
  for (const entry of SHIP) {
    if (!fs.existsSync(path.join(root, entry)))
      errors.push(`配信対象が見つかりません: ${entry}`);
  }
}

/** Every asset the service worker promises to cache must actually exist. */
function checkServiceWorkerShell() {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const block = /const SHELL_ASSETS = \[([\s\S]*?)\];/.exec(sw);
  if (!block) {
    errors.push("sw.js から SHELL_ASSETS を読み取れませんでした");
    return;
  }
  // Accept either quote style — a formatter must not be able to silence this check.
  const listed = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  if (!listed.length) {
    errors.push("sw.js の SHELL_ASSETS が空に見えます（検査が機能していません）");
    return 0;
  }
  for (const asset of listed) {
    if (asset === "./") continue;
    const target = path.join(root, asset.replace(/^\.\//, ""));
    if (!fs.existsSync(target)) {
      errors.push(
        `sw.js がキャッシュしようとするファイルがありません: ${asset}`,
      );
    }
  }
  return listed.length;
}

/**
 * `new URL('../x', import.meta.url)` is how modules reach non-module assets
 * without knowing the base path. Miscount the `../` and the file 404s at
 * runtime with no build-time symptom, so resolve every one of them here.
 */
function checkImportMetaUrls() {
  let checked = 0;
  for (const file of walk(path.join(root, "src"))) {
    if (!file.endsWith(".js")) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
    )) {
      const target = path.resolve(path.dirname(file), match[1]);
      checked += 1;
      if (!fs.existsSync(target)) {
        errors.push(
          `import.meta.url からの相対参照が解決できません: ${rel(file)} → ${match[1]}`,
        );
      }
    }
  }
  return checked;
}

/**
 * A root-absolute path such as `/assets/x.jpg` resolves to the GitHub *user*
 * site, not the project site — the classic way a Pages port breaks.
 */
function checkNoAbsolutePaths() {
  const suspects = [
    /(?:src|href)\s*=\s*"\/(?!\/)/g,
    /(?:from|import)\s*\(?\s*'\/(?!\/)/g,
    /url\(\s*\/(?!\/)/g,
  ];
  for (const file of walk(path.join(root, "src"))
    .concat(walk(path.join(root, "domain")))
    .concat([
      path.join(root, "index.html"),
      path.join(root, "styles.css"),
      path.join(root, "sw.js"),
    ])) {
    if (!/\.(js|html|css|json|webmanifest)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of suspects) {
      const match = pattern.exec(text);
      if (match) {
        errors.push(
          `ルート絶対パスが含まれています（サブパス配信で404になります）: ${rel(file)} → ${match[0]}`,
        );
      }
      pattern.lastIndex = 0;
    }
  }
}

/** Nothing shipped may contain a credential, and no third-party origin may be called. */
function checkNoSecretsOrExternalCalls() {
  const secretPatterns = [
    { name: "OpenAI形式のキー", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
    { name: "Anthropic形式のキー", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/ },
    { name: "Google APIキー", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
    { name: "Bearerトークン", re: /Authorization\s*:\s*['"`]?Bearer\s+\S/i },
    { name: "Neo4j接続情報", re: /\b(?:bolt|neo4j)(?:\+s|\+ssc)?:\/\//i },
    { name: "AWSアクセスキー", re: /\bAKIA[0-9A-Z]{16}\b/ },
  ];

  const files = SHIP.flatMap((entry) => {
    const full = path.join(root, entry);
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  }).filter((file) =>
    /\.(js|mjs|html|css|json|webmanifest|svg|txt|md)$/.test(file),
  );

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const { name, re } of secretPatterns) {
      if (re.test(text))
        errors.push(
          `秘密情報らしき値が含まれています（${name}）: ${rel(file)}`,
        );
    }
    // Any absolute http(s) URL in shipped code would be an outbound call.
    for (const match of text.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
      const url = match[0];
      if (url.startsWith("http://www.w3.org/")) continue; // SVG namespace
      warnings.push(`外部URLの記述: ${rel(file)} → ${url}`);
    }
  }
}

/** The demo photos referenced by the sample data must all be present. */
function checkSampleAssets() {
  const sample = fs.readFileSync(
    path.join(root, "src/data/demo/sample-data.js"),
    "utf8",
  );
  const files = [...sample.matchAll(/"file":\s*"([^"]+\.jpg)"/g)].map(
    (match) => match[1],
  );
  const unique = [...new Set(files)];
  for (const file of unique) {
    if (!fs.existsSync(path.join(root, "assets", file))) {
      errors.push(`サンプル写真がありません: assets/${file}`);
    }
  }
  return unique.length;
}

/** Domain packs must be listed in index.json and each file must parse. */
function checkDomainPacks() {
  const indexPath = path.join(root, "domain/packs/index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  for (const entry of index.packs) {
    const file = path.join(root, "domain/packs", entry.file);
    if (!fs.existsSync(file)) {
      errors.push(`分野パックがありません: domain/packs/${entry.file}`);
      continue;
    }
    const pack = JSON.parse(fs.readFileSync(file, "utf8"));
    if (pack.id !== entry.id) {
      errors.push(`分野パックのidが index.json と一致しません: ${entry.file}`);
    }
  }
  return index.packs.length;
}

// ------------------------------------------------------------------- build ---

/**
 * @param {string} from
 * @param {string} to
 */
function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      if (NEVER_SHIP.has(entry)) continue;
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function assemble() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  for (const entry of SHIP)
    copyRecursive(path.join(root, entry), path.join(dist, entry));
  return walk(dist);
}

// -------------------------------------------------------------------- main ---

checkShipListExists();
if (errors.length) {
  console.error("\nビルド失敗:");
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

const shellCount = checkServiceWorkerShell();
const sampleCount = checkSampleAssets();
const packCount = checkDomainPacks();
const urlCount = checkImportMetaUrls();
checkNoAbsolutePaths();
checkNoSecretsOrExternalCalls();

if (errors.length) {
  console.error("\nビルド失敗:");
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

const files = assemble();
const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);

console.log("build ok");
console.log(`  service worker shell : ${shellCount} 件すべて存在`);
console.log(`  sample photos        : ${sampleCount} 枚すべて存在`);
console.log(`  domain packs         : ${packCount} 件`);
console.log(`  import.meta.url refs : ${urlCount} 件すべて解決`);
console.log("  absolute paths       : なし");
console.log(
  `  secrets / external   : ${warnings.length ? `${warnings.length} 件の外部URL記述` : "なし"}`,
);
console.log(
  `  dist                 : ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`,
);
for (const warning of warnings) console.log(`    ! ${warning}`);
