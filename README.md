# checkst

**English** · [Deutsch](README.de.md)

The calm to-do app for Windows, built on [todo.txt](https://github.com/todotxt/todo.txt).
Your tasks live in a plain text file: local, open and readable in any editor.

Website: [checkst.regbr.de](https://checkst.regbr.de/en/)

## Features

- **todo.txt syntax**: `(A)` priority, `+project`, `@context`, `due:YYYY-MM-DD`, highlighted as you type
- **Quick entry** with suggestions for projects, contexts and due dates (`Tab` accepts)
- **Quick capture** on top of any app with `Ctrl+Alt+T` (configurable)
- Views: All, Today, Upcoming, Priority A, Done, per project and per context
- Group by date, project or priority, sort, filter, search
- **Archive** to `done.txt`, daily backup in `.checkst-backup`, picks up changes made elsewhere (Dropbox, OneDrive, an editor)
- Light, dark or follow Windows, six accent colors, three densities
- English and German, configurable date and time formats
- Optionally starts with Windows in the notification area
- **Automatic updates** from GitHub Releases via [Velopack](https://velopack.io)

The file always stays valid todo.txt: checkst only rewrites the lines you change,
keeps line endings (CRLF/LF) and the BOM, and saves atomically.

## Development

Requirements: Node.js 22+, Rust (stable, MSVC), Visual Studio Build Tools with the C++ workload, WebView2.

```powershell
npm install
npm run tauri dev          # start the app with hot reload
npm test                   # parser tests (Vitest)
cd src-tauri; cargo test   # Rust tests (file access)
```

Layout:

| Path | Contents |
| --- | --- |
| `src/lib/todo.ts` | todo.txt parser and serializer |
| `src/lib/store.tsx` | loading, saving, archive, file watching |
| `src/views/` | main view, task dialog, settings, setup, quick capture |
| `src/styles/` | design tokens (light/dark) and styles from the Pencil designs |
| `src-tauri/src/` | Rust: files, watching, notification area, shortcuts, updates |
| `website/` | landing page for [checkst.regbr.de](https://checkst.regbr.de) (GitHub Pages) |
| `design/` | reference screenshots of the designs and sample data |

## Releases and updates

A release is a tag. GitHub Actions (`.github/workflows/release.yml`) does the rest:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

1. Set the version from the tag, run the tests, build `checkst.exe`
2. Package it with [Velopack](https://velopack.io): `checkst-win-Setup.exe`, `checkst-win-Portable.zip`,
   full and delta packages, `releases.win.json`. The release notes are the commits since the previous tag.
3. Publish a GitHub release
4. Rebuild the website (version, date and download size update themselves)

Alternatively start it from *Actions → Release → Run workflow* with a version number.

The app looks for updates at `https://github.com/checkst-app/checkst/releases/latest/download`
(`UPDATE_URL` in `src-tauri/src/updater.rs`). Installed versions check on startup and every
6 hours, download updates in the background and install them on the next restart. This can be
turned off or triggered manually in *Settings → About checkst*.

Build locally (without publishing): `npm run release -- -Version 0.2.0` → `build\releases\`.

## Website

`website/` is a static site without a framework: `index.html` (German) and `en/index.html`
(English), light/dark/auto, self-hosted fonts (no requests to Google), no tracking.

```powershell
npm run site:build     # build to website/dist (reads repo and release data from GitHub)
npm run site:preview   # http://localhost:4173, ?theme=light|dark forces a color scheme
```

At build time `website/build.mjs` reads from the GitHub API: the repo's description, topics and
license (repo card), the latest version with date and release notes (download section) and the
installer size (hero). The download buttons point to
`releases/latest/download/checkst-win-Setup.exe`, so they always stay current.

`.github/workflows/pages.yml` publishes the site on changes to `website/`, after every release
and once a day. Settings live in `website/site.config.json` (domain, repo, winget package, links
to the legal notice and privacy policy).

**One-time setup:**

1. *Settings → Pages → Build and deployment → Source:* "GitHub Actions"
2. *Settings → Pages → Custom domain:* `checkst.regbr.de`, then "Enforce HTTPS"
3. DNS at regbr.de: `CNAME checkst → checkst-app.github.io`

## License

MIT
