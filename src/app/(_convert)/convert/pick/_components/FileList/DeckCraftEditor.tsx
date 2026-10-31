"use client";

import { GIF_ANIMATION_ENABLED } from "@/const/env";
import { createId } from "@/lib/createId";
import { loadPptxFonts } from "@/lib/deckcraft/loadFonts";

import type { SelectedFile } from "@/_types/file-picker";
import { DeckCraftFileAtom, DeckCraftSlidesAtom } from "@/atoms/deckcraft";
import { OutputFileNameAtom, SelectedFilesAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { Alert, Button, Input, Modal, message } from "@/components/primitives";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { SettingsPanel } from "../Settings";

export function DeckCraftEditor() {
  const [file, setFile] = useAtom(DeckCraftFileAtom);
  const [sourceSlides, setSourceSlides] = useAtom(DeckCraftSlidesAtom);
  const isOpen = !!file || !!sourceSlides;
  const setFiles = useSetAtom(SelectedFilesAtom);
  const [outputName, setOutputName] = useAtom(OutputFileNameAtom);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const images = useRef<Promise<SelectedFile>[]>([]);
  const slideIndexes = useRef<number[]>([]);
  const animationFrames = useRef(
    new Map<
      number,
      {
        fps: number;
        count: number;
        frames: (Promise<OffscreenCanvas> | undefined)[];
      }
    >(),
  );
  const exporting = useRef(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setEditorError(null);
    fetch("/deckcraft/index.html", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          if (!controller.signal.aborted)
            setEditorError(
              "DeckCraft のビルドが見つかりません。pnpm build:deckcraft を実行してください。",
            );
          return;
        }
        if (!response.ok) {
          if (!controller.signal.aborted)
            setEditorError(
              `DeckCraft を読み込めませんでした（HTTP ${response.status}）。`,
            );
          return;
        }
        const html = await response.text();
        if (
          !controller.signal.aborted &&
          !/<canvas\b[^>]*\bid\s*=\s*["']deckcraft_canvas["']/i.test(html)
        )
          setEditorError(
            "DeckCraft のビルドが見つかりません。pnpm build:deckcraft を実行してください。",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setEditorError(
            "DeckCraft を取得できませんでした。サーバーへの接続を確認してください。",
          );
      });
    return () => controller.abort();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !resolvedTheme) return;
    frame.current?.contentWindow?.postMessage(
      {
        source: "imageslide-poc",
        type: "theme",
        dark: resolvedTheme === "dark",
      },
      window.location.origin,
    );
  }, [isOpen, resolvedTheme]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const onMessage = async (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "deckcraft-poc"
      )
        return;
      const data = event.data;
      if (data.type === "ready") {
        if (themeRef.current) {
          frame.current?.contentWindow?.postMessage(
            {
              source: "imageslide-poc",
              type: "theme",
              dark: themeRef.current === "dark",
            },
            window.location.origin,
          );
        }
        try {
          if (file) {
            const bytes = await file.arrayBuffer();
            let fonts: ArrayBuffer[] = [];
            try {
              fonts = await loadPptxFonts(bytes);
            } catch (error) {
              console.warn("Could not load presentation fonts", error);
            }
            if (cancelled) return;
            frame.current?.contentWindow?.postMessage(
              {
                source: "imageslide-poc",
                type: "open",
                name: file.name,
                bytes,
                fonts,
              },
              window.location.origin,
              [bytes],
            );
          } else if (sourceSlides) {
            const slides = await Promise.all(
              sourceSlides.map(async (slide) => ({
                name: `${slide.fileName}.png`,
                note: slide.note ?? "",
                width: slide.canvas.width,
                height: slide.canvas.height,
                bytes: await (
                  await slide.canvas.convertToBlob({ type: "image/png" })
                ).arrayBuffer(),
              })),
            );
            if (cancelled) return;
            frame.current?.contentWindow?.postMessage(
              { source: "imageslide-poc", type: "import-images", slides },
              window.location.origin,
              slides.map((slide) => slide.bytes),
            );
          }
        } catch (error) {
          if (!cancelled)
            message.error(
              error instanceof Error
                ? error.message
                : "スライドを読み込めませんでした",
            );
        }
      } else if (data.type === "close") {
        setSettingsOpen(false);
        setFile(null);
        setSourceSlides(null);
      } else if (data.type === "request-export" && !exporting.current) {
        images.current = [];
        slideIndexes.current = [];
        animationFrames.current.clear();
        exporting.current = true;
        frame.current?.contentWindow?.postMessage(
          {
            source: "imageslide-poc",
            type: "export",
            allowStaticGif: !GIF_ANIMATION_ENABLED,
          },
          window.location.origin,
        );
      } else if (data.type === "open-error") {
        message.error(`PPTX を開けませんでした: ${data.name}`);
      } else if (
        data.type === "slide" &&
        exporting.current &&
        data.bytes instanceof Uint8Array
      ) {
        let metadata: {
          index: number;
          note: string;
          frames: number;
          fps: number;
        };
        try {
          metadata = JSON.parse(data.name);
          if (
            !Number.isInteger(metadata.index) ||
            typeof metadata.note !== "string" ||
            !Number.isInteger(metadata.frames) ||
            metadata.frames < 0 ||
            metadata.frames > 100 ||
            !Number.isFinite(metadata.fps) ||
            metadata.fps <= 0
          )
            throw new Error("invalid metadata");
        } catch {
          exporting.current = false;
          frame.current?.contentWindow?.postMessage(
            { source: "imageslide-poc", type: "export-finished" },
            window.location.origin,
          );
          message.error("スライド情報を受け取れませんでした");
          return;
        }
        slideIndexes.current.push(metadata.index);
        if (metadata.frames > 0)
          animationFrames.current.set(metadata.index, {
            fps: metadata.fps,
            count: metadata.frames,
            frames: [],
          });
        const blob = new Blob([data.bytes as BlobPart], { type: "image/png" });
        images.current.push(
          createImageBitmap(blob).then((bitmap) => {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas を作成できませんでした");
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return {
              id: createId(),
              fileName: `${file?.name ?? "スライド"} (${metadata.index + 1})`,
              note: metadata.note,
              canvas,
              metadata: { fileType: "image" },
            };
          }),
        );
      } else if (
        data.type === "animation-frame" &&
        exporting.current &&
        data.bytes instanceof Uint8Array
      ) {
        try {
          const metadata = JSON.parse(data.name) as {
            index: number;
            frame: number;
          };
          const animation = animationFrames.current.get(metadata.index);
          if (
            !animation ||
            !Number.isInteger(metadata.frame) ||
            metadata.frame < 0 ||
            metadata.frame >= animation.count ||
            animation.frames[metadata.frame]
          )
            throw new Error("invalid frame metadata");
          const blob = new Blob([data.bytes as BlobPart], {
            type: "image/png",
          });
          animation.frames[metadata.frame] = createImageBitmap(blob).then(
            (bitmap) => {
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Canvas を作成できませんでした");
              context.drawImage(bitmap, 0, 0);
              bitmap.close();
              return canvas;
            },
          );
        } catch {
          exporting.current = false;
          frame.current?.contentWindow?.postMessage(
            { source: "imageslide-poc", type: "export-finished" },
            window.location.origin,
          );
          message.error("GIF フレーム情報を受け取れませんでした");
        }
      } else if (data.type === "export-end" && exporting.current) {
        exporting.current = false;
        try {
          const slides = await Promise.all(images.current);
          if (!slides.length) throw new Error("画像が出力されませんでした");
          await Promise.all(
            slides.map(async (slide, i) => {
              const animation = animationFrames.current.get(
                slideIndexes.current[i],
              );
              if (!animation) return;
              if (
                animation.frames.length !== animation.count ||
                Array.from(
                  { length: animation.count },
                  (_, index) => animation.frames[index],
                ).some((value) => !value)
              )
                throw new Error("GIF フレームが不足しています");
              slide.animations = [
                {
                  x: 0,
                  y: 0,
                  w: slide.canvas.width,
                  h: slide.canvas.height,
                  fps: animation.fps,
                  frames: await Promise.all(
                    animation.frames.map((frame) => {
                      if (!frame)
                        throw new Error("GIF フレームが不足しています");
                      return frame;
                    }),
                  ),
                },
              ];
            }),
          );
          if (!cancelled) {
            setFiles(slides);
            setSettingsOpen(true);
          }
        } catch (error) {
          if (!cancelled)
            message.error(
              error instanceof Error
                ? error.message
                : "画像の読み込みに失敗しました",
            );
        } finally {
          if (!cancelled)
            frame.current?.contentWindow?.postMessage(
              { source: "imageslide-poc", type: "export-finished" },
              window.location.origin,
            );
        }
      } else if (data.type === "export-error" && exporting.current) {
        exporting.current = false;
        frame.current?.contentWindow?.postMessage(
          { source: "imageslide-poc", type: "export-finished" },
          window.location.origin,
        );
        message.error(data.name || "スライドの書き出しに失敗しました");
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      exporting.current = false;
      window.removeEventListener("message", onMessage);
    };
  }, [file, isOpen, setFile, setFiles, setSourceSlides, sourceSlides]);

  const close = () => {
    setSettingsOpen(false);
    setFile(null);
    setSourceSlides(null);
  };
  return (
    <>
      {isOpen && (
        <section className="flex min-h-0 flex-1 flex-col">
          {editorError && (
            <div>
              <Button onClick={close}>戻る</Button>
              <Alert type="error" message={editorError} />
            </div>
          )}
          {!editorError && (
            <iframe
              ref={frame}
              title="DeckCraft"
              src="/deckcraft/index.html?blank"
              className="min-h-[480px] w-full flex-1 border-0"
              allow="fullscreen; clipboard-read; clipboard-write"
            />
          )}
        </section>
      )}
      <Modal
        title="出力設定"
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => {
          setSettingsOpen(false);
          setFile(null);
          setSourceSlides(null);
          router.push("./convert");
        }}
        okText="変換する"
        cancelText="編集に戻る"
      >
        <Input
          value={outputName}
          onChange={(event) => setOutputName(event.target.value)}
          placeholder="ファイル名"
          style={{ marginBottom: 16 }}
        />
        {settingsOpen && <SettingsPanel />}
      </Modal>
    </>
  );
}
