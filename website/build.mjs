// Builds the static website into website/dist.
//
// Live data (repo description, topics, license, latest release, download size) is read from the
// GitHub API at build time, so the page needs no client-side API calls. The release workflow
// rebuilds the site after every release, and a daily run picks up repository changes.
//
//   node website/build.mjs            (uses $GITHUB_TOKEN if set, falls back to defaults offline)

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { de, en } from "./src/i18n.mjs";
import { renderPage } from "./src/template.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(here, "dist");
const cfg = JSON.parse(await readFile(join(here, "site.config.json"), "utf8"));
const repo = process.env.GITHUB_REPOSITORY || cfg.repo;
const token = process.env.GITHUB_TOKEN;

async function gh(path) {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "checkst-website-build",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function loadData() {
  let repoInfo = null;
  let release = null;
  try {
    repoInfo = await gh(`repos/${repo}`);
    release = await gh(`repos/${repo}/releases/latest`);
  } catch (e) {
    if (process.env.CI) throw e;
    console.warn(`! GitHub API not reachable, using defaults (${e.message})`);
  }
  const [owner, name] = repo.split("/");
  const url = `https://github.com/${repo}`;
  const releaseDownload = (asset) => `${url}/releases/latest/download/${asset}`;

  let rel = null;
  if (release && !release.draft) {
    const setup = release.assets?.find((a) => a.name === cfg.setupAsset);
    const apk = release.assets?.find((a) => a.name === cfg.androidAsset);
    const published = new Date(release.published_at ?? release.created_at);
    const fmt = (locale) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(published);
    rel = {
      tag: release.tag_name,
      version: release.tag_name.replace(/^v/, ""),
      notesUrl: release.html_url,
      sizeMB: setup ? Math.max(1, Math.round(setup.size / 1_000_000)) : null,
      // The Android app shows up on the page as soon as a release carries the APK.
      android: apk ? { sizeMB: Math.max(1, Math.round(apk.size / 1_000_000)) } : null,
      dateLabel: { de: fmt(de.dateLocale), en: fmt(en.dateLocale) },
    };
  }

  return {
    repo: {
      owner: repoInfo?.owner?.login ?? owner,
      name: repoInfo?.name ?? name,
      url,
      cloneUrl: url,
      description: repoInfo?.description ?? "",
      topics: repoInfo?.topics?.length ? repoInfo.topics : cfg.fallback.topics,
      license: repoInfo?.license?.spdx_id && repoInfo.license.spdx_id !== "NOASSERTION" ? repoInfo.license.spdx_id : cfg.fallback.license,
    },
    release: rel,
    downloads: {
      setup: releaseDownload(cfg.setupAsset),
      portable: releaseDownload(cfg.portableAsset),
      android: releaseDownload(cfg.androidAsset),
      releases: `${url}/releases`,
    },
  };
}

// lucide-static icons, inlined as SVG.
const iconCache = new Map();
async function preloadIcons(names) {
  for (const n of names) {
    const svg = await readFile(join(root, "node_modules/lucide-static/icons", `${n}.svg`), "utf8");
    iconCache.set(n, svg.replace(/<!--[\s\S]*?-->/g, "").trim());
  }
}
const icon = (name, size) => {
  const svg = iconCache.get(name);
  if (!svg) throw new Error(`icon not preloaded: ${name}`);
  return svg
    .replace(/\swidth="24"/, ` width="${size}"`)
    .replace(/\sheight="24"/, ` height="${size}"`)
    .replace("<svg", '<svg aria-hidden="true" focusable="false"')
    .replace(/\s*\n\s*/g, " ");
};

async function fonts() {
  const out = join(dist, "assets/fonts");
  await mkdir(out, { recursive: true });
  const css = [];
  for (const pkg of ["inter", "jetbrains-mono", "outfit"]) {
    const base = join(root, "node_modules/@fontsource-variable", pkg);
    const index = await readFile(join(base, "index.css"), "utf8");
    for (const block of index.split(/(?=\/\*)/)) {
      const m = /\/\*\s*([\w-]+-(latin|latin-ext)-wght-normal)\s*\*\//.exec(block);
      if (!m) continue;
      const file = `${m[1]}.woff2`;
      await copyFile(join(base, "files", file), join(out, file));
      css.push(block.replace(/url\(\.\/files\//g, "url(fonts/").trim());
    }
  }
  await writeFile(join(dist, "assets/fonts.css"), css.join("\n\n") + "\n");
}

const themeBoot = (redirect) =>
  [
    "(function(){var r=document.documentElement;try{",
    redirect
      ? "if(!localStorage.getItem('checkst-lang')&&!(navigator.languages||[navigator.language]).some(function(l){return /^de/i.test(l)})){location.replace('en/');return}"
      : "",
    "var q=new URLSearchParams(location.search).get('theme');",
    "if(q==='light'||q==='dark'||q==='auto')localStorage.setItem('checkst-theme',q);",
    "var c=localStorage.getItem('checkst-theme')||'auto';",
    "var d=c==='dark'||(c==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);",
    "r.dataset.theme=d?'dark':'light'}catch(e){}",
    // Android visitors get the APK as the main download.
    "if(/Android/i.test(navigator.userAgent))r.classList.add('is-android');",
    // Entrance and scroll animations; content stays visible if site.js never runs.
    "if(!matchMedia('(prefers-reduced-motion: reduce)').matches){r.classList.add('motion');",
    "setTimeout(function(){if(!window.__checkstMotion)r.classList.remove('motion')},2500)}})();",
  ].join("");

async function main() {
  const data = await loadData();
  data.buildId = Date.now().toString(36);
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, "en"), { recursive: true });
  await mkdir(join(dist, "assets/img"), { recursive: true });

  const icons = [
    "monitor", "sun", "moon", "download", "cloud", "box", "git-branch", "refresh-cw", "file-text", "calendar",
    "folder", "hash", "archive", "history", "power", "eye", "lock", "bug", "book-marked", "scale", "tag", "copy",
    "package", "folder-archive", "terminal", "minus", "plus", "languages", "smartphone", "x", "check",
  ];
  await preloadIcons(icons);
  await fonts();

  const base = `https://${cfg.domain}/`;
  const alternate = { de: base, en: `${base}en/` };
  const pages = [
    { t: de, lang: "de", file: join(dist, "index.html"), prefix: "", canonical: alternate.de, redirect: true },
    { t: en, lang: "en", file: join(dist, "en/index.html"), prefix: "../", canonical: alternate.en, redirect: false },
  ];
  for (const p of pages) {
    const html = renderPage({ ...p, data: { ...data, themeBoot: themeBoot(p.redirect) }, cfg, icon, alternate });
    await writeFile(p.file, html);
  }

  await copyFile(join(here, "src/site.css"), join(dist, "assets/site.css"));
  await copyFile(join(here, "src/site.js"), join(dist, "assets/site.js"));
  for (const f of await readdir(join(here, "static/img"))) await copyFile(join(here, "static/img", f), join(dist, "assets/img", f));
  await copyFile(join(root, "src-tauri/icons/64x64.png"), join(dist, "assets/img/icon-64.png"));
  await copyFile(join(root, "src-tauri/icons/icon.png"), join(dist, "assets/img/icon-512.png"));

  await writeFile(join(dist, "CNAME"), `${cfg.domain}\n`);
  await writeFile(join(dist, ".nojekyll"), "");
  await writeFile(join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
  await writeFile(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${alternate.de}</loc></url>\n  <url><loc>${alternate.en}</loc></url>\n</urlset>\n`,
  );
  if (existsSync(join(here, "static/404.html"))) await copyFile(join(here, "static/404.html"), join(dist, "404.html"));

  const r = data.release;
  console.log(`✓ website built into website/dist (${repo}, ${r ? `release ${r.tag}, ${r.sizeMB ?? "?"} MB` : "no release yet"})`);
}

await main();
