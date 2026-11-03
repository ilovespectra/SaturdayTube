# Virtual room environments

These five original room plates were generated for Saturday Tube using OpenAI
image generation and outpainted to a 2× wider field of view, then upscaled to
6144 × 4096. The calibrated room occupies the centre half of each plate.
`detail/<room>.webp` holds the separately upscaled centre close-up, registered and
colour-matched to its plate by `tools/scene-detail/build.py` (no bedroom detail yet).

- `kids-room.jpg`: 1990s wood-panelled children's room.
- `cyberpunk.jpg`: rainy neon apartment.
- `basement.jpg`: 1980s basement movie den.
- `bedroom.jpg`: quiet early-1990s bedroom.
- `attic.jpg`: 1980s attic listening room.

The images intentionally contain no TV in the central furniture position.
The live cabinet, contact shadow, dimming and cabinet lighting are composited by
the app. These are flat photographic environments, not navigable 3D rooms.

The current plates are revised versions with props clustered near the TV.
The first versions are preserved in `originals/`. The light emitted by the
playing picture is composited at runtime, not painted into these images.
