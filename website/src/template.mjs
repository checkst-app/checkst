// Renders one language version of the landing page. Structure and sizes follow the pencil design.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

export function mark(size, { c = "currentColor", check, weight = 12, cls = "" } = {}) {
  return `<svg class="mark ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${weight}" aria-hidden="true"><path d="M70 15.36 A40 40 0 1 0 70 84.64" stroke="${c}" pathLength="100"/><path d="M32 50 l16 16 42 -40" stroke="${check ?? c}" pathLength="100"/></svg>`;
}

const windowsLogo = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8.25" height="8.25" rx="1"/><rect x="12.75" y="3" width="8.25" height="8.25" rx="1"/><rect x="3" y="12.75" width="8.25" height="8.25" rx="1"/><rect x="12.75" y="12.75" width="8.25" height="8.25" rx="1"/></svg>`;

// GitHub's octicon "mark-github".
const githubMark = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

export function renderPage({ t, lang, data, cfg, icon, prefix, canonical, alternate }) {
  const r = data.release;
  const repoUrl = data.repo.url;
  const dl = data.downloads;
  const hasRelease = !!r;
  const setupHref = hasRelease ? dl.setup : dl.releases;
  const portableHref = hasRelease ? dl.portable : dl.releases;
  const year = new Date().getFullYear();
  const android = r?.android;
  const heroMeta = `${esc(android ? t.hero.metaAndroid : t.hero.meta)}${r?.sizeMB ? ` · ${r.sizeMB} MB` : ""}`;
  const langSwitch = (cls = "") =>
    `<span class="lang-switch ${cls}"><a href="${prefix}" hreflang="de" data-lang="de" class="${lang === "de" ? "active" : ""}">DE</a><span>/</span><a href="${prefix}en/" hreflang="en" data-lang="en" class="${lang === "en" ? "active" : ""}">EN</a></span>`;
  const chip = (kind, name) => `<span class="chip chip-${kind}">${kind === "project" ? "+" : "@"}${esc(name)}</span>`;
  const key = (k) => `<kbd class="keycap">${esc(k)}</kbd>`;

  const features = t.features;
  const bar = features.bar;
  const note = features.note;
  const legalLinks = [
    cfg.legal.impressumUrl && `<a href="${esc(cfg.legal.impressumUrl)}">${esc(t.footer.impressum)}</a>`,
    cfg.legal.privacyUrl && `<a href="${esc(cfg.legal.privacyUrl)}">${esc(t.footer.privacy)}</a>`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${t.htmlLang}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.metaDescription)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="de" href="${alternate.de}">
<link rel="alternate" hreflang="en" href="${alternate.en}">
<link rel="alternate" hreflang="x-default" href="${alternate.de}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.metaDescription)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${canonical.replace(/en\/$/, "")}assets/img/og-${lang}.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1D7657">
<link rel="icon" type="image/png" href="${prefix}assets/img/icon-64.png">
<link rel="apple-touch-icon" href="${prefix}assets/img/icon-512.png">
<link rel="preload" href="${prefix}assets/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${prefix}assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>${data.themeBoot}</script>
<link rel="stylesheet" href="${prefix}assets/site.css?v=${data.buildId}">
</head>
<body>
<a class="skip" href="#main">${lang === "de" ? "Zum Inhalt springen" : "Skip to content"}</a>

<header class="nav">
  <a class="brand" href="${prefix}${lang === "en" ? "en/" : ""}" aria-label="checkst">${mark(30, { c: "var(--text-primary)", check: "var(--accent)" })}<span>checkst</span></a>
  <nav class="nav-links" aria-label="${lang === "de" ? "Hauptnavigation" : "Main navigation"}">
    <a href="#funktionen">${esc(t.nav.features)}</a>
    <a href="#todotxt">${esc(t.nav.todotxt)}</a>
    <a href="#open-source">${esc(t.nav.openSource)}</a>
    <a href="#faq">${esc(t.nav.faq)}</a>
  </nav>
  <div class="nav-actions">
    ${langSwitch()}
    <div class="theme-toggle" role="radiogroup" aria-label="${esc(t.theme.label)}">
      <button type="button" role="radio" data-theme-choice="auto" aria-label="${esc(t.theme.auto)}">${icon("monitor", 15)}<span>${esc(t.theme.auto)}</span></button>
      <button type="button" role="radio" data-theme-choice="light" aria-label="${esc(t.theme.light)}">${icon("sun", 15)}<span>${esc(t.theme.light)}</span></button>
      <button type="button" role="radio" data-theme-choice="dark" aria-label="${esc(t.theme.dark)}">${icon("moon", 15)}<span>${esc(t.theme.dark)}</span></button>
    </div>
    <a class="btn btn-outline btn-sm hide-sm" href="${repoUrl}">${githubMark(16)}GitHub</a>
    <a class="btn btn-accent btn-sm nav-download" href="#download" aria-label="${esc(t.nav.download)}">${icon("download", 16)}<span>${esc(t.nav.download)}</span></a>
  </div>
</header>

<main id="main">
<section class="hero">
  <p class="badge"><span class="badge-tag">${esc(t.hero.badgeTag)}</span>${esc(hasRelease ? fill(android ? t.hero.badgeAndroid : t.hero.badge, { version: r.version.replace(/\.0$/, "") }) : t.hero.badgeNoRelease)}</p>
  <h1>${t.hero.headline}</h1>
  <p class="hero-sub">${esc(t.hero.subline)}</p>
  <div class="hero-ctas">
    <a class="btn btn-accent btn-lg btn-glow not-android" href="${setupHref}">${windowsLogo(20)}${esc(t.hero.primary)}</a>
    ${android ? `<a class="btn btn-accent btn-lg btn-glow only-android" href="${dl.android}">${icon("smartphone", 20)}${esc(t.hero.primaryAndroid)}</a>` : ""}
    <a class="btn btn-surface btn-lg" href="${repoUrl}">${githubMark(18)}${esc(t.hero.secondary)}</a>
  </div>
  <p class="hero-meta" data-live="hero-meta">${heroMeta}</p>
  <div class="product-shot">
    <img class="only-light" src="${prefix}assets/img/screen-${lang}-light.webp" width="1281" height="801" alt="${esc(t.hero.screenAlt)}" fetchpriority="high">
    <img class="only-dark" src="${prefix}assets/img/screen-${lang}-dark.webp" width="1281" height="801" alt="${esc(t.hero.screenAlt)}" loading="lazy">
  </div>
</section>

<section class="compat" data-reveal aria-label="${esc(t.compat.label)}">
  <span class="compat-label">${esc(t.compat.label)}</span>
  ${["cloud", "box", "git-branch", "refresh-cw", "file-text"].map((ic, i) => `<span class="compat-item">${icon(ic, 18)}${esc(t.compat.items[i])}</span>`).join("\n  ")}
</section>

<section class="features" id="funktionen">
  <div class="section-head" data-reveal>
    <div>
      <p class="eyebrow">${esc(features.eyebrow)}</p>
      <h2>${esc(features.title)}</h2>
    </div>
    <p class="aside">${esc(features.aside)}</p>
  </div>

  <div class="grid-row row-1">
    <article class="card card-syntax" data-reveal>
      <div class="card-text"><h3>${esc(features.syntaxTitle)}</h3><p>${esc(features.syntaxText)}</p></div>
      <div class="syntax-demo">
        <code class="raw-line">${esc(features.syntaxRaw)}</code>
        <hr>
        <div class="task-row">
          <span class="checkbox"></span><span class="prio prio-a">A</span>
          <span class="task-title">${esc(features.syntaxTask)}</span>${chip("project", "Website")}${chip("context", features.syntaxContext)}
          <span class="task-due">${icon("calendar", 14)}${esc(features.syntaxDue)}</span>
        </div>
        <div class="legend">${features.legend.map(([tok, label, cls]) => `<span><code class="tok-${cls}">${esc(tok)}</code>${esc(label)}</span>`).join("")}</div>
      </div>
    </article>

    <article class="card card-quick" data-reveal style="--i:1">
      <div class="card-text"><h3>${esc(features.quickTitle)}</h3><p>${esc(features.quickText)}</p></div>
      <div class="keys">${features.keys.map(key).join('<span class="plus">+</span>')}</div>
      <div class="quick-bar" data-theme="dark">
        <div class="qb-input">
          <span class="qb-icon">${mark(15, { c: "var(--on-accent)", weight: 13 })}</span>
          <span class="qb-text">${esc(bar.text)}</span><span class="qb-context">${esc(bar.context)}</span><span class="qb-token"><span class="qb-typed">${esc(bar.typed)}</span><span class="qb-caret"></span><span class="qb-ghost">${esc(bar.ghost)}</span></span>
        </div>
        <div class="qb-preview"><span>${esc(bar.label)}</span><code>${esc(bar.raw)}</code></div>
        <div class="qb-suggest">
          <div class="qb-section"><span>${esc(bar.section)}</span><span>${esc(bar.sort)}</span></div>
          <div class="qb-item">${icon("folder", 15)}<span class="qb-name"><b>+G</b>${esc(bar.ghost)}</span><span class="qb-meta">${esc(bar.meta)}</span>${key("Tab")}</div>
        </div>
      </div>
    </article>
  </div>

  <div class="grid-row row-note">
    <article class="card card-note" data-reveal>
      <div class="card-text">
        <h3>${esc(features.noteTitle)}</h3>
        <p>${esc(features.noteText)}</p>
        <ul class="note-points">${features.notePoints.map((p) => `<li>${icon("check", 16)}${esc(p)}</li>`).join("")}</ul>
      </div>
      <div class="note-demo" aria-hidden="true">
        <div class="nd-window">${[64, 48, 72, 40, 56].map((w) => `<span class="nd-line" style="width:${w}%"></span>`).join("")}</div>
        <div class="nd-note">
          <div class="nd-header">${icon("sun", 15)}<b>${esc(note.title)}</b><small>${esc(note.summary)} · <span class="nd-overdue">${esc(note.overdue)}</span></small><span class="nd-close">${icon("x", 14)}</span></div>
          <div class="nd-rows">
            ${note.rows
              .map(
                (r) =>
                  `<div class="nd-row ${r.done ? "done" : ""}"><span class="checkbox ${r.done ? "checked" : ""}">${r.done ? icon("check", 12) : ""}</span>${r.prio ? `<span class="prio prio-a">${r.prio}</span>` : ""}<span class="nd-text">${esc(r.text)}</span>${r.chip ? chip(r.chip[0], r.chip[1]) : ""}${r.due ? `<span class="nd-due">${esc(r.due)}</span>` : ""}</div>`,
              )
              .join("\n            ")}
          </div>
          <div class="nd-add">${icon("plus", 15)}<span>${esc(note.add)}</span></div>
        </div>
      </div>
    </article>
  </div>

  <div class="grid-row row-2">
    <article class="card card-small" data-reveal>
      <div class="suggest-demo">
        <div class="sd-input">${esc(features.suggestInput)}<b>+We</b></div>
        ${features.suggestRows.map(([p, c], i) => `<div class="sd-row ${i === 0 ? "active" : ""}">${icon("hash", 14)}<span>${esc(p)}</span><small>${esc(c)}</small></div>`).join("")}
      </div>
      <div class="card-text"><h3>${esc(features.suggestTitle)}</h3><p>${esc(features.suggestText)}</p></div>
    </article>
    <article class="card card-small" data-reveal style="--i:1">
      <div class="theme-demo" aria-hidden="true">
        ${["light", "dark"].map((m) => `<div class="td td-${m}">${[70, 54, 62].map((w, i) => `<div class="td-row"><span class="td-box ${i === 0 ? "on" : ""}"></span><span class="td-line" style="width:${w}px"></span></div>`).join("")}</div>`).join("")}
      </div>
      <div class="card-text"><h3>${esc(features.themeTitle)}</h3><p>${esc(features.themeText)}</p></div>
    </article>
    <article class="card card-small" data-reveal style="--i:2">
      <div class="lang-demo">
        ${features.langSamples.map(([code, a, b], i) => `<div class="ld-row ${i === 0 ? "active" : ""}"><span class="ld-code">${code}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span></div>`).join("")}
      </div>
      <div class="card-text"><h3>${esc(features.langTitle)}</h3><p>${esc(features.langText)}</p></div>
    </article>
  </div>

  <div class="grid-row row-3">
    ${features.small.map(([ic, h, d], i) => `<div class="mini-feature" data-reveal style="--i:${i}"><span class="icon-box">${icon(ic, 19)}</span><b>${esc(h)}</b><p>${esc(d)}</p></div>`).join("\n    ")}
  </div>
</section>

<section class="todotxt" id="todotxt" data-theme="dark">
  <div class="todotxt-text" data-reveal>
    <p class="eyebrow">${esc(t.todotxt.eyebrow)}</p>
    <h2>${esc(t.todotxt.title)}</h2>
    <p class="lead">${esc(t.todotxt.text)}</p>
    <ul class="points">
      ${t.todotxt.points.map(([ic, h, d]) => `<li><span class="icon-box">${icon(ic, 17)}</span><span><b>${esc(h)}</b><span>${esc(d)}</span></span></li>`).join("\n      ")}
    </ul>
  </div>
  <div class="editor" data-reveal style="--i:1" aria-label="todo.txt">
    <div class="editor-bar">${icon("file-text", 14)}<span>${esc(t.todotxt.editorTitle)}</span><span class="spacer"></span><code>UTF-8</code></div>
    <ol class="editor-lines">
      ${t.todotxt.lines.map((line, i) => `<li style="--i:${i}">${line.map(([txt, cls]) => `<span class="tok-${cls}">${esc(txt)}</span>`).join("")}</li>`).join("\n      ")}
      <li class="cursor-line" style="--i:${t.todotxt.lines.length}"><span class="cursor"></span></li>
    </ol>
  </div>
</section>

<section class="open-source" id="open-source">
  <div class="os-text" data-reveal>
    <p class="eyebrow">${esc(t.openSource.eyebrow)}</p>
    <h2>${esc(t.openSource.title)}</h2>
    <p class="lead">${esc(t.openSource.text)}</p>
    <div class="os-buttons">
      <a class="btn btn-surface" href="${repoUrl}">${githubMark(18)}${esc(t.openSource.repoButton)}</a>
      <a class="btn btn-quiet" href="${repoUrl}/issues/new">${icon("bug", 18)}${esc(t.openSource.bugButton)}</a>
    </div>
  </div>
  <div class="repo-card" data-reveal style="--i:1">
    <div class="repo-head">
      <a class="repo-name" href="${repoUrl}">${icon("book-marked", 18)}<span class="owner">${esc(data.repo.owner)} /</span><b>${esc(data.repo.name)}</b><span class="public">Public</span></a>
      <p>${esc(data.repo.description || t.openSource.description)}</p>
      <div class="topics">${data.repo.topics.map((x) => `<a href="https://github.com/topics/${esc(x)}">${esc(x)}</a>`).join("")}</div>
    </div>
    <div class="repo-facts">
      <div><span>${icon("scale", 14)}${esc(t.openSource.license)}</span><b>${esc(data.repo.license)}</b></div>
      <div><span>${icon("tag", 14)}${esc(t.openSource.latest)}</span><b>${hasRelease ? `<a href="${r.notesUrl}">${esc(r.tag)}</a>` : esc(t.openSource.noRelease)}</b></div>
      <div><span>${icon("monitor", 14)}${esc(t.openSource.system)}</span><b>${esc(android ? t.openSource.systemValueAndroid : t.openSource.systemValue)}</b></div>
    </div>
    <div class="repo-clone">
      <code><span>$</span> git clone ${esc(data.repo.cloneUrl)}</code>
      <button type="button" class="copy" data-copy="git clone ${esc(data.repo.cloneUrl)}" aria-label="${esc(t.openSource.copy)}" data-copied="${esc(t.openSource.copied)}">${icon("copy", 16)}</button>
    </div>
  </div>
</section>

<section class="download" id="download">
  <div class="download-box" data-reveal>
    <span class="download-icon">${mark(54, { c: "#FFFFFF", check: "#BFEBD6", weight: 12 })}</span>
    <h2>${esc(t.download.title)}</h2>
    <p class="lead">${esc(t.download.text)}</p>
    <a class="btn btn-white btn-xl not-android" href="${setupHref}">${windowsLogo(22)}${esc(t.download.primary)}</a>
    ${android ? `<a class="btn btn-white btn-xl only-android" href="${dl.android}">${icon("smartphone", 22)}${esc(t.download.primaryAndroid)}</a>` : ""}
    <p class="download-meta">${
      hasRelease
        ? fill(t.download.meta, { version: esc(r.version), date: esc(r.dateLabel[lang]), notes: r.notesUrl })
        : fill(t.download.metaNoRelease, { releases: dl.releases })
    }</p>
    <div class="download-options">
      <a class="option" href="${setupHref}">
        <span class="option-head">${icon("package", 18)}<b>${esc(t.download.installer[0])}</b>${icon("download", 16)}</span>
        <code>${esc(t.download.installer[1])}</code><p>${esc(t.download.installer[2])}</p>
      </a>
      <a class="option" href="${portableHref}">
        <span class="option-head">${icon("folder-archive", 18)}<b>${esc(t.download.portable[0])}</b>${icon("download", 16)}</span>
        <code>${esc(t.download.portable[1])}</code><p>${esc(t.download.portable[2])}</p>
      </a>
      ${
        android
          ? `<a class="option" href="${dl.android}">
        <span class="option-head">${icon("smartphone", 18)}<b>${esc(t.download.android[0])}</b>${icon("download", 16)}</span>
        <code>${esc(t.download.android[1])} · ${android.sizeMB} MB</code><p>${esc(t.download.android[2])}</p>
      </a>`
          : ""
      }
      ${
        cfg.winget
          ? `<button type="button" class="option copy" data-copy="winget install ${esc(cfg.winget)}" data-copied="${esc(t.openSource.copied)}">
        <span class="option-head">${icon("terminal", 18)}<b>${esc(t.download.winget[0])}</b>${icon("copy", 16)}</span>
        <code>${esc(fill(t.download.winget[1], { id: cfg.winget }))}</code><p>${esc(t.download.winget[2])}</p>
      </button>`
          : ""
      }
    </div>
  </div>
</section>

<section class="faq" id="faq">
  <div class="faq-head" data-reveal><p class="eyebrow">${esc(t.faq.eyebrow)}</p><h2>${esc(t.faq.title)}</h2></div>
  <div class="faq-list">
    ${t.faq.items.map(([q, a, aAndroid], i) => `<details open data-reveal style="--i:${i}"><summary>${esc(q)}${icon("minus", 18)}${icon("plus", 18)}</summary><p>${esc(android && aAndroid ? aAndroid : a)}</p></details>`).join("\n    ")}
  </div>
</section>
</main>

<footer class="footer">
  <div class="footer-top">
    <div class="footer-brand">
      <span class="brand small">${mark(26, { c: "var(--text-primary)", check: "var(--accent)" })}<span>checkst</span></span>
      <p>${esc(t.footer.claim)}</p>
    </div>
    <div class="footer-cols">
      <div><b>${esc(t.footer.product)}</b><a href="#funktionen">${esc(t.footer.productLinks[0])}</a><a href="#download">${esc(t.footer.productLinks[1])}</a><a href="${dl.releases}">${esc(t.footer.productLinks[2])}</a><a href="#faq">${esc(t.footer.productLinks[3])}</a></div>
      <div><b>${esc(t.footer.oss)}</b><a href="${repoUrl}">${esc(t.footer.ossLinks[0])}</a><a href="${repoUrl}/issues/new">${esc(t.footer.ossLinks[1])}</a><a href="${repoUrl}/pulls">${esc(t.footer.ossLinks[2])}</a><a href="${repoUrl}/blob/main/LICENSE">${esc(t.footer.ossLinks[3])}</a></div>
      ${legalLinks.length ? `<div><b>${esc(t.footer.legal)}</b>${legalLinks.join("")}</div>` : ""}
    </div>
  </div>
  <div class="footer-bottom">
    <span>${esc(fill(t.footer.copyright, { year }))}</span>
    <span class="footer-lang">${icon("languages", 14)}<a href="${prefix}" data-lang="de" class="${lang === "de" ? "active" : ""}">Deutsch</a><a href="${prefix}en/" data-lang="en" class="${lang === "en" ? "active" : ""}">English</a></span>
  </div>
</footer>
<script src="${prefix}assets/site.js?v=${data.buildId}" defer></script>
</body>
</html>
`;
}
