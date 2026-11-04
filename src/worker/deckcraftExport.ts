/// <reference lib="webworker" />

// The editor and this worker instantiate the same DeckCraft WASM module separately.
// The worker never starts the editor UI; it renders the exported document snapshot.
self.addEventListener(
  "message",
  async (
    event: MessageEvent<{
      bytes: Uint8Array;
      fonts: Uint8Array[];
      width: number;
      height: number;
      animated: boolean;
      wasmModule?: WebAssembly.Module;
    }>,
  ) => {
    try {
      const manifestResponse = await fetch("/deckcraft/host-manifest.json", {
        cache: "no-store",
      });
      if (!manifestResponse.ok)
        throw new Error("DeckCraft の情報を読み込めませんでした");
      const manifest: { module: string; wasm: string } =
        await manifestResponse.json();
      const base = new URL("/deckcraft/", self.location.origin);
      const bindings = await import(
        /* @vite-ignore */ new URL(manifest.module, base).href
      );
      await bindings.default({
        module_or_path:
          event.data.wasmModule ?? new URL(manifest.wasm, base).href,
      });
      let conversionError: string | undefined;
      (
        self as unknown as {
          imageSlideSend: (
            type: string,
            name: string,
            bytes: Uint8Array,
          ) => void;
        }
      ).imageSlideSend = (type, name, bytes) => {
        if (conversionError) return;
        if (type !== "slide" && type !== "animation-frame") {
          self.postMessage({ type, name });
          return;
        }
        try {
          const { width, height } = JSON.parse(name) as {
            width: number;
            height: number;
          };
          if (
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0 ||
            bytes.length !== width * height * 4
          )
            throw new Error("画像データのサイズが不正です");
          const canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("画像を作成できませんでした");
          context.putImageData(
            new ImageData(new Uint8ClampedArray(bytes), width, height),
            0,
            0,
          );
          const bitmap = canvas.transferToImageBitmap();
          self.postMessage({ type, name, bitmap }, { transfer: [bitmap] });
        } catch (error) {
          conversionError =
            error instanceof Error ? error.message : String(error);
        }
      };
      const { bytes, fonts, width, height, animated } = event.data;
      bindings.export_in_worker(bytes, fonts, width, height, animated);
      if (conversionError)
        self.postMessage({ type: "export-error", name: conversionError });
    } catch (error) {
      self.postMessage({
        type: "export-error",
        name: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
