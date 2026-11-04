#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$root/vendor/deckcraft"
if [[ ! -f "$source_dir/Cargo.toml" ]]; then
  echo 'Run git submodule update --init --recursive first.' >&2
  exit 1
fi
# Build from a temporary copy so generated files leave the submodule clean.
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cp -a "$source_dir/." "$tmp_dir/"
rm -f "$tmp_dir/.git"
# A shared Cargo target can otherwise reuse workspace artifacts built from a
# different copy whose source mtimes happen to be newer than these files.
find "$tmp_dir" -type f -exec touch {} +
cd "$tmp_dir"
# Web fonts come from the runtime catalog, not the WebAssembly binary.
unset CRAFT_FONTS_DIR CRAFT_FONTS_REQUIRED
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/imageslide-deckcraft-target}"
cd apps/deckcraft-web
# Default to the release speed optimization; set DECKCRAFT_OPT_LEVEL=z for smaller builds.
env CARGO_PROFILE_RELEASE_OPT_LEVEL="${DECKCRAFT_OPT_LEVEL:-3}" CARGO_PROFILE_RELEASE_LTO=fat CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 \
  trunk build --release
node "$root/scripts/instrument-deckcraft.mjs" "$tmp_dir/dist/web/index.html"
cd "$tmp_dir"
mkdir -p "$root/public/deckcraft"
# Remove superseded generated bundles while leaving the runtime font catalog intact.
find "$root/public/deckcraft" -maxdepth 1 -type f \
  \( -name 'deckcraft-web-*_bg.wasm' -o -name 'deckcraft-web-*.js' \) -delete
cp -a dist/web/. "$root/public/deckcraft/"
cp LICENSE-MIT NOTICE ATTRIBUTION.md "$root/public/deckcraft/"
