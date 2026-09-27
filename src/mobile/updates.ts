// Android updates: the APK is attached to every GitHub release. The app checks for it here,
// downloads it itself and opens the system installer, which installs it over the old version
// (same signing key, so the todo.txt grant and settings stay).

const REPO = "checkst-app/checkst";
export const REPO_URL = `https://github.com/${REPO}`;
export const APK_ASSET = "checkst-android.apk";

export interface Release {
  version: string;
  url: string;
}

export async function latestRelease(): Promise<Release | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = (await r.json()) as { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] };
  const apk = j.assets?.find((a) => a.name === APK_ASSET) ?? j.assets?.find((a) => /\.apk$/i.test(a.name));
  return { version: j.tag_name.replace(/^v/, ""), url: apk?.browser_download_url ?? j.html_url };
}

/** true if version `a` is newer than `b` (numeric x.y.z, pre-release suffix ignored). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
