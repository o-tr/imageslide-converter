# DeckCraft integration

The pinned DeckCraft submodule is used to build the browser editor. The DeckCraft bridge patch is applied to a temporary copy, leaving the submodule clean. The bridge accepts messages only from its same-origin parent. Modified builds retain the MIT notices in `public/deckcraft`.

## Build

Requirements: Rust with the `wasm32-unknown-unknown` target, Trunk, Python 3 and the tools Trunk downloads for the WebAssembly build.

```sh
git submodule update --init --recursive
rustup target add wasm32-unknown-unknown
cargo install trunk --locked
pnpm build:deckcraft
pnpm dev
```

The web build embeds no fonts. `public/deckcraft` is generated and ignored; build it before running or deploying the app. The current Dockerfile does not build it. At runtime, configure the font catalog described below before opening the editor.

At startup, the browser fetches Inter (or Noto Sans) and Noto Sans JP (or BIZ UDPGothic) from the server's font catalog for the editor UI and fallback. For PPTX input, it also inspects typefaces referenced in slide and theme XML and downloads matching fonts or available open substitutes from that catalog. Proxima Nova is not in Google Fonts and falls back to Montserrat; substitutions can differ in appearance and metrics. The catalog does not query a user's computer or download from third parties during editing. Fonts and their licences are stored together.

Local PPTX, PDF and image files, and Google Drive PPTX, PDF and images, open in DeckCraft. Google Slides are exported to PPTX and opened in DeckCraft. After editing, export to retain slide order and speaker notes and set conversion options. Non-presented (hidden) slides are excluded. Slides imported from multiple images share one slide size: the first image establishes the aspect ratio; other aspect ratios are fitted inside it.

The DeckCraft export bridge renders slides with animated GIF pictures as full-slide animation frames at 10 fps, preserving the slide's drawing order. Their combined loop must fit within 10 seconds, and animation output requires EIA v1 RGB24 (cropped), as supported by ImageSlide v0.3.x. Set `NEXT_PUBLIC_ENABLE_GIF_ANIMATION=false` at build time to export a static image instead. Layouts, unsupported media, embedded fonts, custom typefaces and animations need validation against real presentations. Google Slides files are never modified.

The embedded browser build puts Back and Export in DeckCraft's title bar, hides the File, Slide Show and Record tabs and the slideshow status control, and translates the main ribbon tabs, common ribbon buttons and notes prompt into Japanese. DeckCraft does not yet provide a Japanese UI locale, so other menus and dialogs remain in English.

## Offline Google Fonts image volume

An optional, separately versioned OCI image can contain the Google Fonts catalog. Build it from the repository root and push it to a registry:

```sh
docker build -f docker/fonts/Dockerfile -t YOUR_REGISTRY/imageslide-google-fonts:YOUR_VERSION .
docker push YOUR_REGISTRY/imageslide-google-fonts:YOUR_VERSION
```

The build uses the pinned `google/fonts` commit in the Dockerfile, indexes the `ofl`, `apache`, and `ufl` directories, and packages supported TTF/OTF files alongside each family's license and metadata. This is a large image; updating its font revision is a deliberate, separate operation. Use the published image digest in `deploy/font-image-volume.example.yaml`, adapting the fragment to the actual Deployment.

The image volume feature is stable and enabled by default from Kubernetes 1.36; earlier Kubernetes versions and the container runtime must support it. The repository currently has no deployment manifest, so the example is a fragment rather than a ready-to-apply Deployment. The font image is mounted read-only. The server serves only paths listed in its catalog and rejects paths that escape the mounted directory. Set `DECKCRAFT_FONT_DIR` to the mount; when it is unset, the server looks for a catalog at `public/deckcraft/fonts`. For local development, the same pack can be generated from a checkout of `google/fonts` with `python3 scripts/create-google-font-pack.py /path/to/google/fonts public/deckcraft/fonts`. The editor reports an error when the catalog or required UI fonts are unavailable.

The editor runs in browser WebAssembly, so the browser must still receive the font bytes it uses. It reads them from this application's mounted catalog; the application does not fetch fonts from Google when users open documents. The browser selects the fonts referenced by the presentation to avoid downloading the entire font collection.
