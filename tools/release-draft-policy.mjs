import { nextVersion } from './version-policy.mjs';

export function parseGitHubRemote(value) {
  const match = String(value).trim().match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function ownerReleaseTarget(login, remote, expected = { owner: 'ilovespectra', repo: 'saturday-tube-2' }) {
  const target = parseGitHubRemote(remote);
  if (!target || target.owner.toLowerCase() !== String(login).toLowerCase()) return null;
  if (target.owner.toLowerCase() !== expected.owner.toLowerCase() || target.repo.toLowerCase() !== expected.repo.toLowerCase()) return null;
  return target;
}

// Reuse an untagged current version after an interrupted owner release; if a
// release already exists for it, advance rather than modifying that release.
export function selectOwnerVersion(current, existingReleaseTags) {
  return existingReleaseTags.includes(`v${current}`) ? nextVersion(current) : current;
}
