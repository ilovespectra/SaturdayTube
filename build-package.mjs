import { packager } from '@electron/packager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';

const root = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const arch = process.argv.slice(2).find(argument => ['arm64', 'x64'].includes(argument)) || process.arch;
const releaseBuild = process.argv.includes('--release');
const bundleName = releaseBuild ? 'Saturday Tube' : 'Saturday Tube Candidate';
if (!['arm64', 'x64'].includes(arch)) {
  throw new Error(`Unsupported macOS architecture: ${arch}. Use arm64 or x64.`);
}
const output = process.env.SATURDAY_TUBE_BUILD_OUTPUT || path.join(root, 'dist');
const bundledDecoderResources = [
  'vendor/ffmpeg/ffmpeg',
  'vendor/ffmpeg/FFmpeg-LGPLv2.1.txt',
  'vendor/ffmpeg/FFmpeg-8.0-source.tar.xz',
  'vendor/ffmpeg/BUILDINFO.txt'
].map(file => path.join(root, file));
for (const resource of bundledDecoderResources) await access(resource);
const appRuntimeEntitlements = ['com.apple.security.cs.allow-jit', 'com.apple.security.cs.disable-library-validation'];
function optionsForSignedApp(filePath) {
  const isBundleExecutable = filePath.includes(`${path.sep}Contents${path.sep}MacOS${path.sep}`);
  if (!filePath.endsWith('.app') && !isBundleExecutable) return {};
  const entitlements = [...appRuntimeEntitlements];
  if (filePath.includes('(Plugin).app')) entitlements.push('com.apple.security.cs.allow-unsigned-executable-memory');
  return { entitlements };
}
try {
  const paths = await packager({
    dir: root,
    name: bundleName,
    // Keep QA isolated while release replacement retains the installed app identity.
    appBundleId: releaseBuild ? 'com.ilovespectra.saturdaytube' : 'com.ilovespectra.saturdaytube.candidate',
    appVersion: packageJson.version,
    appCopyright: 'Copyright Saturday Tube',
    platform: 'darwin',
    arch,
    icon: path.join(root, 'assets', 'SaturdayTube.icns'),
    extraResource: bundledDecoderResources,
    out: output,
    overwrite: true,
    asar: true,
    prune: true,
    // Ad-hoc signing seals the renamed app on this Mac without a Developer ID.
    osxSign: { identity: '-', identityValidation: false, optionsForFile: optionsForSignedApp },
    osxNotarize: false,
    ignore: [/node_modules/, /package-lock[.]json$/, /build-package.*[.](?:cjs|mjs)$/, /(^|[\\/])test([\\/]|$)/, /(^|[\\/])dist([\\/]|$)/, /(^|[\\/])tools([\\/]|$)/, /(^|[\\/])README[.]md$/, /vendor[\\/]ffmpeg([\\/]|$)/]
  });
  for (const p of paths) console.log(path.resolve(p));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
