#!/bin/bash
# Regenerate the placeholder character-state videos in
# apps/web/public/characters/ from the reference stills at the repo root
# (Lily.jpg, Max.jpg, Sokrates.jpg). See README.md in this folder.
#
# Pipeline per character:
#   1. cutout.swift  — macOS Vision foreground mask -> transparent PNG
#   2. crop          — consistent head-and-upper-body square framing
#   3. render        — whole-figure bob/tilt motion over a shared radial
#                      gradient, one clip per state, webm (VP9) + mp4 (H.264)
#                      + a resting-pose poster JPEG
#
# Motion is deliberately simple; sinusoid periods divide each clip duration
# exactly so idle/speaking/listening loop seamlessly, and greeting is a
# one-shot that starts and ends at rest. The app only depends on the file
# layout characters/<id>/<id>-<state>.{webm,mp4} and <id>-poster.jpg, so
# replacing these with real character renders is a pure asset swap.
#
# Requires: macOS 14+ (Vision foreground masks), ffmpeg with libvpx-vp9.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$ROOT/apps/web/public/characters"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Head-and-upper-body square framing measured on each source image:
# crop=<side>:<side>:<x0>:<y0> on the full-resolution cutout.
crop_for() {
  case $1 in
    lily)     echo "700:700:36:25" ;;
    max)      echo "2000:2000:856:380" ;;
    sokrates) echo "360:360:133:0" ;;
  esac
}
src_for() {
  case $1 in
    lily) echo "$ROOT/Lily.jpg" ;;
    max) echo "$ROOT/Max.jpg" ;;
    sokrates) echo "$ROOT/Sokrates.jpg" ;;
  esac
}

# Shared background: radial gradient echoing the app's avatar circle.
ffmpeg -y -v error -f lavfi -i \
  "gradients=s=1440x1440:c0=0xEBEBF0:c1=0xFAFAFA:x0=720:y0=500:x1=720:y1=1650:type=radial" \
  -frames:v 1 "$WORK/bg.png"

render() {
  local c=$1 state=$2 dur=$3 rot=$4 xe=$5 ye=$6
  # Sokrates' source crop is upscaled ~2x; a light unsharp keeps him crisp.
  local sharpen=""
  [ "$c" = "sokrates" ] && sharpen=",unsharp=5:5:0.35"
  # Figure is overscaled to 1520 on a 1440 canvas (40px overhang per side) so
  # translation/rotation never reveals the crop's cut edges inside the frame.
  local graph="[0:v]scale=1520:1520:flags=lanczos${sharpen},format=rgba,rotate=a='${rot}':c=none[fig];[1:v][fig]overlay=x='-40+(${xe})':y='-40+(${ye})':format=auto,scale=720:720:flags=lanczos,format=yuv420p[out]"
  local in=(-loop 1 -framerate 30 -t "$dur" -i "$WORK/${c}_sq.png"
            -loop 1 -framerate 30 -t "$dur" -i "$WORK/bg.png")

  ffmpeg -y -v error "${in[@]}" -filter_complex "$graph" -map "[out]" \
    -c:v libvpx-vp9 -b:v 0 -crf 36 -deadline good -cpu-used 2 -row-mt 1 -an \
    "$OUT/$c/$c-$state.webm"
  ffmpeg -y -v error "${in[@]}" -filter_complex "$graph" -map "[out]" \
    -c:v libx264 -crf 21 -preset medium -movflags +faststart -an \
    "$OUT/$c/$c-$state.mp4"
  echo "rendered $c-$state"
}

for c in lily max sokrates; do
  mkdir -p "$OUT/$c"

  xcrun swift "$HERE/cutout.swift" "$(src_for "$c")" "$WORK/${c}_cut.png"
  ffmpeg -y -v error -i "$WORK/${c}_cut.png" -vf "crop=$(crop_for "$c")" \
    "$WORK/${c}_sq.png"

  # Per-character personality: Lily lively, Max calm, Sokrates slow/thoughtful.
  case $c in
    lily)     R1=0.010 A1=7 B1=3 R2=0.012 A2A=5 A2B=3 R3=0.020 A3=3 B3=3 G=34 W=0.050 ;;
    max)      R1=0.007 A1=6 B1=3 R2=0.009 A2A=4 A2B=3 R3=0.016 A3=3 B3=3 G=26 W=0.035 ;;
    sokrates) R1=0.005 A1=5 B1=2 R2=0.007 A2A=3 A2B=3 R3=0.014 A3=3 B3=2 G=22 W=0.030 ;;
  esac

  # idle: slow breathing bob + very gentle sway. 6s loop.
  render "$c" idle 6 \
    "$R1*sin(2*PI*t/6)" \
    "$B1*sin(2*PI*t/6)" \
    "$A1*sin(2*PI*t/3)"

  # speaking: quicker rhythmic bob layered on breathing + lively sway. 4s loop.
  render "$c" speaking 4 \
    "$R2*sin(2*PI*t/2)" \
    "2*sin(2*PI*t/4)" \
    "$A2A*sin(2*PI*t/0.8)+$A2B*sin(2*PI*t/4)"

  # listening: slow attentive head-tilt + tiny nods. 5s loop.
  render "$c" listening 5 \
    "$R3*sin(2*PI*t/5)" \
    "$B3*sin(2*PI*t/5)" \
    "$A3*sin(2*PI*t/1.25)"

  # greeting: one-shot perk-up (rise + 3 tapered wiggles), starts/ends at rest.
  render "$c" greeting 2.2 \
    "$W*sin(2*PI*t/0.7333333)*sin(PI*t/2.2)" \
    "0" \
    "-$G*sin(PI*t/2.2)"

  # poster: the resting pose (t=0 of idle), used as <video poster> + fallback.
  ffmpeg -y -v error -i "$WORK/${c}_sq.png" -i "$WORK/bg.png" -filter_complex \
    "[0:v]scale=1520:1520:flags=lanczos,format=rgba[fig];[1:v][fig]overlay=x=-40:y=-40:format=auto,scale=720:720:flags=lanczos[out]" \
    -map "[out]" -frames:v 1 -q:v 3 "$OUT/$c/$c-poster.jpg"
  echo "rendered $c-poster"
done

echo "done -> $OUT"
