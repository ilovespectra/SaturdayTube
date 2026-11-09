const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function nextVersion(value) {
  const match = String(value).match(VERSION_RE);
  if (!match) throw new Error(`Expected stable x.y.z app version, got ${value}`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 9) return `${major + 1}.0.0`;
  if (patch > 9) return minor < 9 ? `${major}.${minor + 1}.0` : `${major + 1}.0.0`;
  if (patch < 9) return `${major}.${minor}.${patch + 1}`;
  if (minor < 9) return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}
