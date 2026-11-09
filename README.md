# Saturday Tube 2 (Electron)

This Electron project is maintained separately from the legacy native C++/libmpv version.

## Requirements

- macOS 13 or newer
- Node.js 22.12.0 or newer (the `@electron/packager` dependency requires it)
- npm, included with Node.js

Install Node.js for Apple Silicon from [nodejs.org](https://nodejs.org/) if needed, then check `node --version` before continuing.

## Run Saturday Tube 2

Clone the repository, open its folder in Terminal, install dependencies, and start the app:

```sh
npm install
npm run dev
```

`npm run dev` starts Saturday Tube directly from source in Electron using the pinned Electron runtime. It does not use the previously AirDropped app bundle or open a browser-only preview: the renderer depends on Electron's native preload bridge and the `saturday://` media protocol. Run it from this project folder; video conversion uses the local `vendor/ffmpeg/ffmpeg` binary, not a Homebrew install. The packaged app carries the same decoder at `Contents/Resources/ffmpeg`. Dev mode and packaged test candidates use separate `Saturday Tube Dev` / `Saturday Tube Candidate` profiles and a distinct candidate bundle ID, so testing does not reuse the installed app's data. The Picture Lab adds scanlines, curvature, edge blur, hue, VHS tracking, glitch, and broken-tape controls. Scanlines, edge blur, and glow go up to 200%; the other dials top out at 100%. The Tape Deck FX include VHS, Cathode Hum, AM Radio, Lo-Fi, and Tape Wobble. The Tape Shelves open a folder chosen through the native macOS folder picker and browse its playable files locally. `npm test` exercises rotary input, shader controls, audio wiring, library boundaries, and scrolling.

The molded 1990s TV/VCR cabinet keeps its cassette loader, playback keys, channel, volume, and tracking rockers beneath the screen. Physical playback keys remain visible on every input and window width; TV input disables them instead of removing them, since broadcasts cannot be paused or skipped. The VHS loader stays at a fixed 300-by-66 CSS-pixel size at every window width; its door proportions represent an approximately 190 mm VHS opening rather than stretching with the cabinet. Tracking adjusts the same VHS artifact control as the Picture Lab. The TV Guide badge appears only on TV input. The RCA jacks open Audio settings; the gear opens Video settings. The Cabinet settings page holds the Wood, Grey, Black, and Clear finishes, Wood/Clear tint, and molded, smooth, woodgrain, and olive field texture skins. Fresh installs start in graphite Grey; saved finishes are preserved. The Tapes settings page contains playlists, captions, and commercial options. The Channels settings page sets a channel source folder (such as `TV-Channels`): every channel folder inside it becomes a channel, and new folders are picked up on each launch and rescan. A channel folder may hold one subfolder per show, loose videos (aired as a block named after the channel), or both. A `Commercials` folder is optional; commercials are read per channel, with no shared WATCH folder; channels without one play programmes back-to-back with no breaks. Start a channel folder's name with a number to set its place on the dial: `2_90s`, `9_Disney`, `12_MTV`. The number only sets the order and never appears in the channel's name or label; unnumbered folders come last. Renaming or numbering a folder keeps its channel, resume point and commercials. Each round airs every show once in a fresh random order, and the show that just aired never opens the next round. Within a show, episodes air in order: by season and episode number, then by air date or year in the filename, then by filename. Loose videos in the channel folder itself (music videos, movies, specials) air in random order and don't repeat until all of them have aired, unless they're numbered episodes, which stay in order. Commercial reels (any file over three minutes, or a bumper, promo, ad, or commercial compilation over 45 seconds) are split into single spots in the background, one folder at a time; a reel never airs whole. A split needs a black frame and a pause in the sound together. A fade to black under continuing voice-over or music stays inside one spot, unless that would make a clip longer than about a minute. Reels split by an older version keep airing and are re-split automatically. Automatically split spots of 90 seconds or less air without manual review. Breaks run after every segment of up to 14 minutes, so movies are interrupted too. Each channel works through its whole ad pool before repeating a spot, and when new spots arrive, every upcoming break is re-dealt without disturbing what is on air. Before a break airs, FFmpeg scans the stretch around its planned cut, from a minute before to two and a half minutes after. It measures the audio's loudness every 20 ms, then moves the break to the quietest pause between lines, never a gap inside a word. A quiet fade to black wins. Otherwise the break waits for a real silence, then a softer lull. Cuts already on air can still move, but only to a point well ahead of the picture, and cuts planned by older analysis are re-checked automatically. Programmes under eight minutes, such as music videos, air whole with a break afterwards. The broadcast clock follows the picture: if a programme or ad starts or buffers a little late, the schedule waits for it, so every ad plays to its last frame and the next segment starts at its first. Cuts that aren't already black get a quick fade of picture and sound to black, and back out when the programme returns. Results are saved in `channel-break-cache.json`, and the soonest breaks are analysed first, at low priority. Channel videos and tapes whose audio Chromium can't play get a cached copy with AAC audio, prepared before the programme airs. This covers AC-3, E-AC-3, DTS, TrueHD, MP2 and PCM; only AAC, MP3, Opus, Vorbis and FLAC play as-is. An audio watchdog checks playback every second. It unmutes the player and resumes stalled audio, re-routes the output and falls back to the system default device. If a picture plays without decoded sound, it converts the file automatically. The programme on screen always converts first: warm-up copies for other channels and upcoming programmes run one at a time and wait while it converts. H.264 and HEVC pictures are kept as-is, and the sound becomes stereo AAC, so a copy is ready in about the time it takes to read the file. A failed sound repair is retried. Converted copies may be up to 8 GB each and 16 GB in total, never leaving less than 8 GB free on the disk. A damaged or incomplete file that can't be read even by FFmpeg, or that reads nothing for 15 seconds, is skipped: the channel moves on to the next programme instead of waiting on LOADING, and that file is skipped for a day. Ad-break fades keep running while the window is hidden. On TV input, the TV LEVELER switch in Audio settings (on by default) evens out loudness. It measures each programme, movie and commercial ahead of the volume dial and adjusts the gain gradually so every channel plays at about the same level. It reacts quickly when a new file starts, never boosts silence, and has a gentle compressor to catch peaks. VIDEO input is unaffected. At launch the first playable channel tunes in as soon as it has been scanned, and the remaining channels are scanned and scheduled in channel order in the background, whatever is on screen, so they are warm before you surf to them. Each channel's playlist (shows, episodes, durations, and commercials) is generated once and saved in `channel-catalog-cache.json` in the app's user-data folder. Later launches reuse it without walking the drive or probing videos, as long as the channel folder, its show folders, and its commercials folder are unchanged. Pressing **↻ REFRESH** rebuilds every channel's playlist and picks up new channel folders. Use it after editing episodes inside nested season folders. Channels always resume where they left off. Landing-page picture effects use the same continuously refreshed CRT shader as playback, without a fixed scanline overlay.

 Picture effects and cabinet preferences save when adjusted and again when the app quits. Every channel retains its queue, episode rotation, commercial ordering, and segment position across restarts. The tuned channel saves its actual media playback offset (including mid-commercial or split-program playback); other channels retain their virtual broadcast offsets. Time while the app is closed or restoring channel folders does not advance the saved broadcasts. Once startup is ready, channels again advance while the app runs, including while tuned to another input or station.

 ### Guide and intermissions

 The TV Guide shows each channel's dial number. Page to a channel and press
 **Enter** (on the keyboard or remote), or choose **WATCH CH**, to tune it.
 Each page has a saved **AD FREE** toggle. Turning it on removes commercials
 from that channel's schedule while preserving the programme position; if an ad
 is already playing, it moves straight to the next programme segment. Turning it
 off restores future commercial breaks. Other channels are unaffected.

 **SHUFFLE ALL** in the Guide deals fresh programme and commercial queues for
 every channel, including disabled channels, while keeping show exclusions and
 ad-free preferences. It uses the loaded catalogues, not a full disk rescan,
 shows progress, saves the new schedules, and retunes the current TV channel.
 Episodes within a show still follow season/episode order.

 **SETUP → BREAKS** enables optional automatic intermissions (off by default).
 Choose 1–480 minutes between breaks and a 1–120 minute break length;
 defaults are 60 and 15 minutes. The timer runs on every input (TV, VHS and SAT),
 including while paused or buffering, without resetting when channels change.
 The Breaks settings show a countdown to the next automatic break.
 The full-window animated colour-bar card shows a countdown and rotating reminders.
 All channels' clocks, videos, SAT playback and sound effects freeze, including commercials.
 Live conversions stop until playback resumes. **END BREAK EARLY**, Escape,
 or the remote's Enter/OK/Back ends the break; a manually paused video stays paused.
 **TAKE A BREAK NOW** starts a break immediately. Preferences survive restarts;
 progress toward the next break is saved across refreshes and restarts.

### Phone remote

Open **SETUP → REMOTE**, switch **PHONE REMOTE** on, and scan the QR code with your phone's camera. Your phone and the Mac must be on the same Wi-Fi. The remote is off by default. It needs the pairing key in the QR code, and **NEW PAIRING CODE** disconnects any phone that was paired before. The first time you switch it on, macOS may ask whether Saturday Tube can accept incoming connections; allow it.

The remote is laid out like a cable-box remote:
- **POWER** (beside INPUT): closes the TV window, stops playback and terminates live channel streaming. The paired Wi-Fi remote stays connected; press POWER again to reopen the TV. Quitting the app completely also stops the remote, so reopening then requires launching Saturday Tube on the computer.
- **Inputs:** TV, VCR and INPUT switch the input. **SAT** is the satellite-labelled static input; its playback behavior is unchanged. SHELF opens the tape shelf and SETUP/MENU opens the settings.
- **GENESIS gamepad:** when AUX is selected and a cartridge is loaded, the phone remote switches to a six-button controller. Hold the D-pad, face, shoulder, START or SELECT buttons; either analog stick also steers the D-pad. HOME returns to video input. Buttons and stick axes release when lifted or when the phone disconnects.
- **Fullscreen key** (beside INPUT), or **⌘F**: cycle through SCREEN ONLY → WHOLE TV → DIM ROOM → SCENES → window. Esc leaves the current view. One fullscreen icon has a small current-view label; the remote display briefly names the new view.
- **House / ROOM key:** enters the saved virtual room; subsequent presses cycle the five rooms, preserving each room's cabinet-size calibration.
- **Playback:** play/pause, rewind and fast-forward (VCR only; each press jumps 10 s), and previous/next tape. The redundant tracking buttons have been removed from the cabinet and remote. VHS tracking is a picture-distortion effect, not seeking; it remains adjustable in the picture settings.
- **Volume and channel:** VOL (one step per press; hold to repeat), CH and MUTE. LAST goes back to the previous channel. Volume ticks and MUTE show on the TV screen, and changing channel briefly shows its number and name.
- **Number pad:** type a channel number. It uses the number at the start of each channel folder's name. A single digit waits 3 seconds for a second one (or ENT); two digits, such as 0-9 or 1-2, tune at once.
- **Arrows, OK and EXIT:** arrows move a yellow highlight around whatever is on screen (shelf, guide or settings). Left/right turn dials and change dropdowns, OK selects, and EXIT goes back. On the shelf, EXIT goes up a folder before it closes the shelf.
- **VIDEO FX / AUDIO FX:** turn the picture filters and the audio effects on or off, the same as **PICTURE FILTER BYPASS** and **FX BYPASS** in the settings. The light on each key is lit while those effects are on, and the remote's display briefly shows the new setting.
- **SCREEN / COLOR / SKIN:** **SCREEN** switches between CRT and rear projection, **COLOR** steps through the color, low-stimulation and black-and-white filters, and **SKIN** paints the TV cabinet a random color (saved like a color picked in the settings). Each key shows the current setting.
- **Flip** (the arrows key at the bottom left) turns the remote over to its back, where analog controls change the TV settings without opening the menu: **VIDEO** (picture FX, color filter, screen type, scanlines, curve, edge blur, hue, tracking, glitch, broken tape, glow, brightness, cabinet), **AUDIO** (audio FX, effect, FX mix, leveler, clicks and click volume), **ROOM** (room, light, zoom, auto zoom, motion and zoom speed) and **INTERMISSION** (breaks on or off, how often, how long, and START BREAK). Drag a knob up or right to turn it up; tap a selector's window or arrows to step through its choices. Changes apply and save exactly as they do in the settings. **FLIP** at the bottom of the back turns it over again.
- **A / B buttons:** A (ADD) marks the highlighted tape and B (QUEUE) adds the marked tapes to the playlist.
- **GUIDE:** opens the TV guide, switching to TV first if needed. The Guide is remote-only; there is no cabinet Guide button.
- **PAGE ◀ / ▶** (above the arrows): turn TV guide pages, switch settings tabs, or scroll the tape shelf a screen at a time. The arrows stay free to move the cursor. With nothing open on TV, PAGE changes channel.

The remote's display shows the channel, the programme and the volume as they change.

**SCREEN MIRROR** (in **SETUP → REMOTE**) opens a view-only copy of the remote in this Mac's browser. It follows the paired phone live: pressed keys, the backlight, darkness and sleep, the LCD and LED, the Genesis pad's sticks, and the remote settings sheet, and which side of the remote is facing up. It can't send presses; the phone only reports its looks while a mirror is open.

### Virtual rooms

**SETUP → SCENES** offers five room environments, outpainted to twice the field
of view and upscaled to 6144 × 4096 (zoom out to see the wider room): a 1990s kids room, rainy neon
apartment, basement movie den, quiet bedroom, and attic hideaway. Choose a room
and press **ENTER SCENE**, or use the fourth fullscreen step. This covers the
display completely; your desktop never shows through.
Rooms with a matching close-up carry a sharper detail layer for the area around the TV
(`assets/scenes/detail`, built by `tools/scene-detail/build.py`). It fades in over a
quarter second as you zoom in past the plate's native resolution, like your eyes
adjusting, and fades out as you zoom back. Zoomed all the way out, the room's outer
edges get a gentle tilt-shift blur around a sharp TV area; it clears as you zoom in.
The room selector and movement hint fade away after 2.5 seconds of mouse inactivity;
moving the pointer brings them back. Settings stays inside the visible TV screen,
including when the cabinet is zoomed out or moved. The Guide keeps its larger layout.

**ROOM LIGHT** dims the environment and changes simulated directional highlights
and shading on the cabinet without dimming the playing picture. The picture's light
lights the cabinet the way a recessed tube would: it floods the bezel walls around the glass,
falls off into the recess corners, and reaches the face beside it only as a softer bounce.
The room's key light comes from the upper left, so the cabinet and the raised bezel cast
shadows down and to the right, the bezel lip shades the top of the glass until the picture
outshines it, and the base darkens where it meets the furniture. These shadows firm up as
ROOM LIGHT rises. A contact shadow seats the cabinet on the furniture. The TV also casts a soft glow onto the room,
sampling the playing picture's colour and brightness ten times per second; black
pictures emit no glow. Existing cabinet finishes and picture effects
remain available. These are flat photographic scenes with simulated lighting,
not 3D rooms or physically ray-traced reflections.

The CRT render target is bounded to 1920 pixels on its longest edge and
1920 × 1080 pixels in total, at up to 60 animated frames per second, including
on Retina/high-refresh displays. Minimizing or hiding the window suspends picture
drawing without stopping audio or channel clocks. Room glow samples the existing
picture composite rather than reading a full frame back from the GPU. Live
FFmpeg playback runs at real-time input speed with a two-second startup allowance;
replaced or cancelled streams terminate their encoders. These bounds do not clear
your media, saved rooms or preferences.
Dragging, screen-size edits and lighting redraws share the same camera so the
background stays aligned with the TV rather than jumping between redraws.
Room lighting uses opacity over black instead of a full-room brightness filter;
glow and reflection masks are limited to the illuminated area, not the whole room.
**BRIGHTNESS** (Picture Lab, 50% is neutral) is the set's backlight: it brightens the
picture and TV settings menu, lifts the blacks when turned up like a real tube, and so
brightens the room and cabinet light too. GLOW adds bloom and makes the room light
stronger and throw farther. Room spill and furniture reflections follow the screen
colour after the picture filters (B&W, low stim, hue, rear projection), and an open
settings menu lights the room in its own blue; a black picture does not produce an
artificial blue room light.
The settings menu takes on the picture filters too: B&W, low stim, hue, rear projection,
glow, and on a CRT its scan lines, curvature and corner shading.

Scene mode defaults to a square screen, with a taller compact TV/VCR cabinet.
**TV SCREEN HEIGHT** adjusts the screen from 50–150% of its width, growing upward
without moving or resizing the controls and VHS deck below. Video automatically
fits inside the screen at its original aspect ratio, without stretching. Screen
height is shared across rooms and remembered across refreshes and restarts.
**TV SIZE ON FURNITURE** adjusts the
TV's apparent size relative to the furniture by scaling the background, not the TV.
Each room remembers its own furniture scale and lighting.
Switching rooms keeps the cabinet fixed and restores that room's saved framing;
each background is aligned to the same fixed furniture anchor. Existing per-room size preferences
remain independent. The last selected room's TV size initializes a persistent,
shared on-screen anchor; room switching never changes that anchor, screen height,
zoom or pan.
**TV LEFT / RIGHT** and **TV UP / DOWN** reframe the background behind a stationary
TV, shadow and glow, without changing room zoom. The art moves in the opposite
direction and expands as needed to avoid exposing its edges.
Each room remembers its own placement across refreshes and restarts; adjusting
one room never relocates the TV in another. Existing shared placement is copied
to each room on upgrade to preserve the current view.
**CENTER TV ON FURNITURE** resets only the current room's placement; **RESET VIEW** still resets
the whole room's framing independently.
The original, less cluttered room plates are retained in `assets/scenes/originals`.

**ROOM / TV ZOOM** (25–3200%) scales the whole scene together; the mouse wheel,
trackpad pinch and two-finger touchscreen pinch also zoom. Pinching brings the
TV and room closer or farther away without changing the TV's size on the shelf.
High zoom centres on the TV screen so you can fill the display with the picture.
Drag the room or an empty cabinet edge to relocate it. Furniture, lighting
and TV stay registered, and shrinking the room reveals black around it. **RESET
VIEW** restores centered framing. Room, light, zoom, cabinet size and position are
remembered across refreshes and app restarts, including the selected fullscreen
view (so scene mode reopens when that is how you left it). Volume and mute also
restore exactly as saved. Use the small **SCENE SETTINGS**
button to adjust the scene when the TV is too small to reach its settings gear.

The tape shelf opens with a gentle slide-and-unfold animation (disabled with
reduced motion). Larger paper labels make titles easier to read. Clearly named
episodes from the same show share one cover: open it to choose an episode, then
use **BACK TO YOUR TAPES** to return. Existing nested folders remain browsable;
ambiguous filenames stay separate, and no files are moved or renamed.

**Backlight and sleep:**
The entire area **outside the handset** is a trackpad. One finger moves the cursor,
a tap clicks, and double-tap-and-hold drags. A mouse can click and drag directly.
Gestures starting outside the handset continue across its buttons without pressing
them or moving the page. Gestures starting on the handset remain handset controls.
Two fingers scroll; pinch zooms the TV room rather than the remote page.
By default the whole handset fits the screen height, leaving trackpad room on both
sides even on phones. **REMOTE SIZE** in the remote's settings (gear key) enlarges
it from WHOLE up to FILL WIDTH; the choice is remembered on that device.
On macOS this controls the actual desktop cursor, including Finder and file dialogs.
The native helper requires Apple Command Line Tools (Swift) and Accessibility
permission in System Settings > Privacy & Security > Accessibility; failures
display an explicit error on the computer. Other platforms retain TV-window input.
Only pair trusted phones: a paired macOS remote can control desktop applications.

- **Ambient light:** the remote darkens with the room. Where the browser has a light sensor (`AmbientLightSensor`) it uses that, and dim light (about 40 lux or less) counts as fully dark. Otherwise it estimates darkness from the time of day and the phone's dark mode, because phones don't give a page on plain Wi-Fi HTTP access to the sensor: it is fully dark from 6 pm to 7 am and never lighter than mostly dark while the phone is in dark mode. Tap the **saturday tube** logo to cycle AUTO → BRIGHT → DIM → DARK.
- **Backlight:** pressing any button lights every key green for 3 seconds. It always lights, but the glow is faint in a bright room and strong in the dark. Waking the remote, scrolling, or touching the case doesn't light it.
- **Sleep:** after 30 seconds without a press, the remote goes black. The next tap only wakes it and lights the keys; it doesn't press a button.
- **Screen stays on:** while the remote is in use, it keeps the phone's screen awake (with a tiny muted looping video when Wake Lock isn't available). That way, waking it never needs an unlock. After 10 minutes asleep it stops doing this, so the phone can lock normally.

## Build a local Apple Silicon app

Stop the development app with **Command-Q**, then run:

```sh
npm run package:mac -- arm64
```

That builds an isolated test candidate under `dist/`. For a release that replaces the installed app and reuses its existing profile, run `npm run package:mac -- --release arm64`. Omit `arm64` to package for the Mac's current architecture. `npm ci` uses the committed lockfile, and `npm test` runs the built-in Node test runner without additional test dependencies.

The local package is ad-hoc signed and is not notarized. This repository does not include Apple Developer credentials; macOS may require approval when opening the packaged app. FFmpeg is built from the included FFmpeg 8.0 source archive with GPL and version-3 components disabled; its LGPL 2.1 license and source archive ship inside the app bundle. Development mode is the shortest route to run this local copy. The cabinet finish gallery includes three locally bundled reference photographs; their sources and licenses are listed in `assets/materials/CREDITS.md`.

## Startup diagnostics

Channel playback takes priority over optional drive analysis. Common MP4/MOV/WebM programmes load without waiting for a codec probe; audio is checked alongside playback and incompatible tracks still switch to live AAC conversion. Changing channels cancels obsolete probes and file reads. Live conversion keeps a small six-second startup allowance and can catch up after an input stall without encoding the entire programme ahead of time. After loading or buffering, broadcast-clock drift follows the actual picture rather than repeatedly seeking to catch up with wall time.

Automatic break-point analysis is deferred while TV or VCR playback is selected, and resumes on SAT. Previously analysed cuts remain available; unanalysed breaks retain their planned timing. Upcoming-file checks wait for five uninterrupted seconds of playback and scan completion. The screen and remote distinguish reading channel files, rebuilding schedules, loading video, and buffering; a small `UPDATING CHANNELS` count remains visible while other channels prepare. Sustained loading uses an animated neutral picture instead of a frozen shot of the previous programme.

The main process writes `launch.log` under Electron's `userData` folder. It restores window bounds before construction and shows the window only after the renderer restores preferences, arranges the controls, initializes the picture, and signals presentation readiness. This avoids flashing default finishes and intermediate layouts before the CRT power-on animation. Renderer load/console errors remain logged, and a visible fallback page appears on a load failure or if presentation is not ready within 12 seconds, including when the HTML loads but renderer initialization fails.

## Shuffle Channel Lineups

In Settings → Channels, **⤨ SHUFFLE LINEUPS** shuffles upcoming series and loose programmes across every channel without interrupting the programmes already on air. Episodes within each series remain in season/episode order, and movies do not repeat until the eligible pool is exhausted. **↻ REFRESH** remains the separate action for rebuilding playlists and finding changes on disk.

## Developer Console

Run `npm run dev:console` to execute the real test-and-package workflow. It runs
`npm test`, bumps the patch version, then packages an isolated **Saturday Tube
Candidate** app (separate bundle ID/profile) into `dist/candidates/`; it never
installs over the regular app. Set `SATURDAY_TUBE_BUILD_OUTPUT` to stage the
candidate elsewhere. This is local-only: official GitHub release publishing,
website downloads, and in-app update feeds are not wired yet, and this console
will not publish them. GitHub permissions—not a hidden owner flag—must protect
any future official publishing workflow.
