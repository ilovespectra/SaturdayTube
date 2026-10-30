# Saturday Tube 2 (Electron)

This independent Electron project is kept separate from the older native C++/libmpv project in `/Users/tanny/Documents/github/saturday-tube`.

## Requirements

- macOS 13 or newer
- Node.js 22.12.0 or newer (the `@electron/packager` dependency requires it)
- npm, included with Node.js

Install Node.js for Apple Silicon from [nodejs.org](https://nodejs.org/) if needed, then check `node --version` before continuing.

## Run Saturday Tube 2

From Terminal, run this copy with:

```sh
cd /Users/tanny/Documents/github/saturday-tube-2
npm run dev
```

`npm run dev` starts Saturday Tube directly from source in Electron using the pinned Electron runtime. It does not use the previously AirDropped app bundle or open a browser-only preview: the renderer depends on Electron's native preload bridge and the `saturday://` media protocol. Run it from this project folder; video conversion uses the local `vendor/ffmpeg/ffmpeg` binary, not a Homebrew install. The packaged app carries the same decoder at `Contents/Resources/ffmpeg`. Dev mode and packaged test candidates use separate `Saturday Tube Dev` / `Saturday Tube Candidate` profiles and a distinct candidate bundle ID, so testing does not reuse the installed app's data. Scanlines and Curvature start at maximum; the Picture Lab adds edge blur, hue, VHS tracking, glitch, and broken-tape controls. The Tape Deck FX include VHS, Cathode Hum, AM Radio, Lo-Fi, and Tape Wobble. Pick Wood, Grey, Black, Clear, Yellow, Red, Green, or Blue for the cabinet finish. The Tape Shelves open a folder chosen through the native macOS folder picker and browse its playable files locally. `npm test` exercises rotary input, shader controls, audio wiring, library boundaries, and scrolling.

## Build a local Apple Silicon app

Stop the development app with **Command-Q**, then run:

```sh
npm run package:mac -- arm64
```

The packaged app is written under `dist/`. Omit `arm64` to package for the Mac's current architecture. `npm ci` uses the committed lockfile, and `npm test` runs the built-in Node test runner without additional test dependencies.

The local package is ad-hoc signed and is not notarized. This repository does not include Apple Developer credentials; macOS may require approval when opening the packaged app. FFmpeg is built from the included FFmpeg 8.0 source archive with GPL and version-3 components disabled; its LGPL 2.1 license and source archive ship inside the app bundle. Development mode is the shortest route to run this local copy. The cabinet finish gallery includes three locally bundled reference photographs; their sources and licenses are listed in `assets/materials/CREDITS.md`.

## Startup diagnostics

The main process writes `launch.log` under Electron's `userData` folder. It now shows the window before the renderer finishes loading, records renderer load/console errors, and displays a visible fallback page if the screen errors or has not loaded after 12 seconds. This targets the Pawn-boi report, where the quarantined 0.4.3 arm64 app was rejected by Gatekeeper but remained alive without a crash; the report alone did not prove whether the window was hidden or the renderer stalled.
