# checkst

[English](README.md) · **Deutsch**

Die ruhige To-do-App für Windows und Android auf Basis von [todo.txt](https://github.com/todotxt/todo.txt).
Deine Aufgaben liegen in einer einfachen Textdatei, lokal, offen und in jedem Editor lesbar.

Website: [checkst.regbr.de](https://checkst.regbr.de)

## Funktionen

- **todo.txt-Schreibweise**: `(A)` Priorität, `+Projekt`, `@Kontext`, `due:JJJJ-MM-TT`, farbig hervorgehoben
- **Schnelleingabe** mit Vorschlägen für Projekte, Kontexte und Fälligkeiten (`Tab` übernimmt)
- **Schnellerfassung** über jeder Anwendung mit `Strg+Alt+T` (frei wählbar)
- Ansichten: Alle, Heute, Anstehend, Priorität A, Erledigt, pro Projekt und Kontext
- Gruppieren nach Datum, Projekt oder Priorität, Sortieren, Filtern, Suche
- **Archiv** in `done.txt`, tägliche Sicherung in `.checkst-backup`, erkennt Änderungen von außen (Dropbox, OneDrive, Editor)
- Hell, Dunkel oder wie Windows, sechs Akzentfarben, drei Dichten
- Deutsch und Englisch, Datums- und Zeitformate einstellbar
- Startet auf Wunsch mit Windows im Infobereich
- **Automatische Updates** über GitHub Releases mit [Velopack](https://velopack.io)
- **Android-App** mit derselben todo.txt: Datei in der Dateiauswahl des Systems wählen, zum Beispiel
  in einem Syncthing-, OneDrive- oder Google-Drive-Ordner. Wischen zum Abhaken, Schnelleingabe mit `(A) + @ due:`-Leiste

Die Datei bleibt immer gültiges todo.txt: checkst schreibt nur Zeilen um, die du änderst,
behält Zeilenenden (CRLF/LF) und BOM bei und speichert atomar.

## Entwicklung

Voraussetzungen: Node.js 22+, Rust (stable, MSVC), Visual Studio Build Tools mit C++-Workload, WebView2.

```powershell
npm install
npm run tauri dev      # App mit Hot-Reload starten
npm test               # Parser-Tests (Vitest)
cd src-tauri; cargo test   # Rust-Tests (Dateizugriff)
```

Für Android zusätzlich JDK 17, Android SDK mit NDK (`JAVA_HOME`, `ANDROID_HOME`, `NDK_HOME`) und
die Rust-Targets:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm run tauri android dev                    # im Emulator oder auf einem angeschlossenen Handy
npm run tauri android build -- --apk         # APK unter src-tauri/gen/android/app/build/outputs/apk
```

Aufbau:

| Pfad | Inhalt |
| --- | --- |
| `src/lib/todo.ts` | todo.txt-Parser und -Serializer |
| `src/lib/store.tsx` | Laden, Speichern, Archiv, Überwachung |
| `src/views/` | Hauptansicht, Dialog, Einstellungen, Einrichtung, Schnellerfassung |
| `src/mobile/` | Android-Oberfläche (Liste, Schnelleingabe, Bearbeiten, Listen, Einstellungen, Einrichtung) |
| `src/styles/` | Design-Tokens (hell/dunkel) und Styles aus den Pencil-Designs |
| `src-tauri/src/` | Rust: Dateien und Einstellungen (`lib.rs`), Desktop (`desktop.rs`), Android (`android.rs`) |
| `src-tauri/gen/android/` | Android-Projekt; `CheckstPlugin.kt` liest und schreibt die gewählte todo.txt |
| `website/` | Landingpage für [checkst.regbr.de](https://checkst.regbr.de) (GitHub Pages) |
| `design/` | Referenz-Screenshots der Designs und Beispieldaten |

## Releases und Updates

Ein Release ist ein Tag. GitHub Actions (`.github/workflows/release.yml`) übernimmt den Rest:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

1. Version aus dem Tag setzen, Tests laufen lassen, `checkst.exe` bauen
2. Mit [Velopack](https://velopack.io) packen: `checkst-win-Setup.exe`, `checkst-win-Portable.zip`,
   Voll- und Delta-Pakete, `releases.win.json`. Die Versionshinweise kommen aus den Commits seit dem letzten Tag.
3. Als GitHub-Release veröffentlichen
4. Parallel die signierte Android-App bauen und als `checkst-android.apk` anhängen
5. Website neu bauen (Version, Datum und Downloadgrößen aktualisieren sich)

Alternativ im Tab *Actions → Release → Run workflow* mit einer Versionsnummer starten.

Die App sucht Updates unter `https://github.com/checkst-app/checkst/releases/latest/download`
(`UPDATE_URL` in `src-tauri/src/updater.rs`). Installierte Versionen prüfen beim Start und alle
6 Stunden, laden Updates im Hintergrund und installieren sie beim nächsten Neustart. In
*Einstellungen → Über checkst* lässt sich das abschalten oder manuell auslösen.

Lokal bauen (ohne Veröffentlichung): `npm run release -- -Version 0.2.0` → `build\releases\`.

**Android:** Die App prüft beim Start (und unter *Einstellungen → Über checkst*) das neueste
GitHub-Release und verlinkt die neue APK; Android installiert sie über die alte Version. Das klappt
nur, wenn jede APK mit demselben Schlüssel signiert ist. Der Release-Workflow signiert deshalb mit
diesen Repository-Secrets:

| Secret | Inhalt |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | der Keystore (`.jks`), Base64-kodiert |
| `ANDROID_KEY_PASSWORD` | Passwort von Keystore und Schlüssel |
| `ANDROID_KEY_ALIAS` | Alias des Schlüssels (`checkst`) |

Ohne sie gibt der Android-Job nur eine Warnung aus, und das Release enthält nur Windows. Den
Keystore gut aufbewahren: Ohne ihn lassen sich installierte Apps nicht mehr aktualisieren. Für
lokale Release-Builds eine `keystore.properties` (`storeFile`, `password`, `keyAlias`) nach
`src-tauri/gen/android/` legen (steht in `.gitignore`).

## Website

`website/` ist eine statische Seite ohne Framework: `index.html` (Deutsch) und `en/index.html`
(Englisch), Hell/Dunkel/Auto, selbst gehostete Schriften (keine Anfragen an Google), kein Tracking.

```powershell
npm run site:build     # nach website/dist bauen (liest Repo- und Release-Daten von GitHub)
npm run site:preview   # http://localhost:4173, ?theme=light|dark erzwingt ein Farbschema
```

Beim Bauen liest `website/build.mjs` aus der GitHub-API: Beschreibung, Topics und Lizenz des
Repos (Repo-Karte), die neueste Version mit Datum und Versionshinweisen (Download-Bereich) und die
Größe des Installers (Hero). Sobald ein Release `checkst-android.apk` enthält, zeigt die Seite auch
den Android-Download (auf Android-Handys als Haupt-Button). Die Download-Buttons zeigen auf
`releases/latest/download/checkst-win-Setup.exe` und bleiben damit immer aktuell.

`.github/workflows/pages.yml` veröffentlicht die Seite bei Änderungen an `website/`, nach jedem
Release und einmal täglich. Einstellungen stehen in `website/site.config.json` (Domain, Repo,
winget-Paket, Links zu Impressum und Datenschutz).

**Einmalig einrichten:**

1. *Settings → Pages → Build and deployment → Source:* „GitHub Actions“
2. *Settings → Pages → Custom domain:* `checkst.regbr.de`, danach „Enforce HTTPS“
3. DNS bei regbr.de: `CNAME checkst → checkst-app.github.io`

## Lizenz

MIT
