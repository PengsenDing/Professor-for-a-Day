# Character state videos

The student characters (Lily, Max, Sokrates) are shown in the web app as
pre-rendered, muted video clips — one per animation state — living under
`apps/web/public/characters/<id>/`:

```text
<id>-idle.webm/.mp4       seamless loop, 6s  — breathing, gentle sway
<id>-greeting.webm/.mp4   one-shot, 2.2s     — perk-up + wiggle, ends at rest
<id>-speaking.webm/.mp4   seamless loop, 4s  — livelier rhythmic motion
<id>-listening.webm/.mp4  seamless loop, 5s  — slow attentive head-tilt + nods
<id>-poster.jpg           resting pose        — <video poster> / error fallback
```

The app (`apps/web/src/lib/characters.ts`, `components/character-video-avatar.tsx`)
depends only on this file layout and the four-state contract. The clips carry
**no audio** — the AI voice always plays through the speech pipeline while the
matching clip loops.

## Current placeholders

`render.sh` generates the current v1 placeholders from the reference stills at
the repo root (`Lily.jpg`, `Max.jpg`, `Sokrates.jpg`): a macOS Vision cutout,
a consistent head-and-upper-body crop, and simple whole-figure bob/tilt motion
over a shared radial-gradient background. Run it from anywhere:

```bash
bash infrastructure/scripts/character-videos/render.sh
```

Requires macOS 14+ (Vision foreground masks) and ffmpeg with libvpx-vp9.

## Replacing with real animation renders

Export each state to the same paths and formats and the app picks them up
unchanged. Keep these properties:

- square (1:1) frame, character centred, consistent framing across states;
- idle/speaking/listening loop seamlessly (first frame ≈ last frame);
- greeting is a one-shot that starts and ends at the resting pose;
- muted (no audio track), and an updated `<id>-poster.jpg` resting still.
