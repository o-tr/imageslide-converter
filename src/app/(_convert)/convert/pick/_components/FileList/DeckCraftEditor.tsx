"use client";

import { GIF_ANIMATION_ENABLED } from "@/const/env";
import { createId } from "@/lib/createId";
import {
  type StartupEvent,
  deckcraftHost,
  onDeckcraftEvent,
  prepareDeckcraftHost,
  sendDeckcraft,
} from "@/lib/deckcraft/host";
import { loadPptxFonts } from "@/lib/deckcraft/loadFonts";

import type { SelectedFile } from "@/_types/file-picker";
import {
  type DeckCraftSession,
  SetDeckCraftSessionAtom,
} from "@/atoms/deckcraft";
import { OutputFileNameAtom, SelectedFilesAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { Alert, Button, Input, Modal, message } from "@/components/primitives";
import { useAtom, useSetAtom } from "jotai";
import { Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsPanel } from "../Settings";

/** The embedded editor writes startup failures into its loading element. */
export function deckCraftStartupError(text: string | null): string | null {
  const value = text?.trim();
  if (
    value &&
    /^(?:フォントを読み込めませんでした|必要なフォントを読み込めませんでした|DeckCraft failed to start)/i.test(
      value,
    )
  )
    return value;
  return null;
}

export function DeckCraftEditor({
  session,
  active,
}: { session: DeckCraftSession; active: boolean }) {
  const file = session.kind === "pptx" ? session.file : null;
  const sourceSlides = session.kind === "slides" ? session.slides : null;
  const closeSession = useSetAtom(SetDeckCraftSessionAtom);
  const setFiles = useSetAtom(SelectedFilesAtom);
  const [outputName, setOutputName] = useAtom(OutputFileNameAtom);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
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
  const [loading, setLoading] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const [wasmProgress, setWasmProgress] = useState<{
    received: number;
    total: number | null;
    done: boolean;
  }>({ received: 0, total: null, done: false });
  const [initialFonts, setInitialFonts] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  const [fontStatus, setFontStatus] = useState<
    "loading" | "done" | "skipped" | "failed"
  >("loading");
  const [slideOpening, setSlideOpening] = useState(false);
  const [fontProgress, setFontProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const updateStartup = useCallback(
    (data: {
      type: string;
      received?: number;
      total?: number | null;
      completed?: number;
      message?: string;
    }) => {
      if (data.type === "wasm-progress" && typeof data.received === "number") {
        setWasmProgress({
          received: data.received,
          total: typeof data.total === "number" ? data.total : null,
          done: false,
        });
      } else if (data.type === "wasm-ready") {
        setWasmProgress((current) => ({ ...current, done: true }));
      } else if (data.type === "wasm-error") {
        setEditorError(
          `DeckCraft を読み込めませんでした: ${data.message ?? "不明なエラー"}`,
        );
      } else if (
        data.type === "initial-font-progress" &&
        typeof data.completed === "number" &&
        typeof data.total === "number"
      ) {
        setInitialFonts({ completed: data.completed, total: data.total });
      }
    },
    [],
  );

  useEffect(() => {
    prepareDeckcraftHost();
  }, []);

  useEffect(() => {
    const target = surface.current;
    if (!target) return;
    const { host } = deckcraftHost();
    const update = () => {
      const rect = target.getBoundingClientRect();
      Object.assign(host.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        visibility: active && !editorError && !loading ? "visible" : "hidden",
        pointerEvents: active && !editorError && !loading ? "auto" : "none",
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      host.style.visibility = "hidden";
      host.style.pointerEvents = "none";
    };
  }, [active, editorError, loading]);

  useEffect(() => {
    if (resolvedTheme)
      sendDeckcraft({ type: "theme", dark: resolvedTheme === "dark" });
  }, [resolvedTheme]);

  useEffect(() => {
    let cancelled = false;
    let fontLoading = true;
    const presentation = file
      ? (async () => {
          const bytes = await file.arrayBuffer();
          let fonts: ArrayBuffer[] = [];
          let fontFailed = false;
          try {
            fonts = await loadPptxFonts(bytes, (completed, total) => {
              if (!cancelled && fontLoading)
                setFontProgress({ completed, total });
            });
          } catch (error) {
            fontFailed = true;
            console.warn("Could not load presentation fonts", error);
          } finally {
            fontLoading = false;
            if (!cancelled)
              setFontStatus(
                fontFailed ? "failed" : fonts.length > 0 ? "done" : "skipped",
              );
          }
          return { bytes, fonts };
        })()
      : null;
    // Attach a handler immediately: the editor may not be ready when reading fails.
    presentation?.catch(() => {});
    const onMessage = async (data: StartupEvent) => {
      if (data.requestId && data.requestId !== session.id) return;
      updateStartup(data);
      if (data.type === "ready") {
        setEditorReady(true);
        if (themeRef.current) {
          sendDeckcraft({
            source: "imageslide-poc",
            type: "theme",
            dark: themeRef.current === "dark",
          });
        }
        try {
          if (file && presentation) {
            const { bytes, fonts } = await presentation;
            if (cancelled) return;
            setSlideOpening(true);
            sendDeckcraft({
              source: "imageslide-poc",
              type: "open",
              requestId: session.id,
              name: file.name,
              bytes,
              fonts,
            });
          } else if (sourceSlides) {
            setSlideOpening(true);
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
            sendDeckcraft({
              source: "imageslide-poc",
              type: "import-images",
              requestId: session.id,
              slides,
            });
          }
        } catch (error) {
          if (!cancelled) {
            setEditorError(
              error instanceof Error
                ? error.message
                : "スライドを読み込めませんでした",
            );
          }
        }
      } else if (data.type === "opened") {
        setLoading(false);
      } else if (data.type === "close") {
        setSettingsOpen(false);
        closeSession(null);
      } else if (data.type === "request-export" && !exporting.current) {
        images.current = [];
        slideIndexes.current = [];
        animationFrames.current.clear();
        exporting.current = true;
        sendDeckcraft({
          source: "imageslide-poc",
          type: "export",
          allowStaticGif: !GIF_ANIMATION_ENABLED,
        });
      } else if (data.type === "open-error") {
        const detail = typeof data.name === "string" ? data.name.trim() : "";
        setEditorError(
          detail
            ? `スライドを開けませんでした: ${detail}`
            : "スライドを開けませんでした",
        );
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
          metadata = JSON.parse(data.name ?? "");
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
          sendDeckcraft({ source: "imageslide-poc", type: "export-finished" });
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
          const metadata = JSON.parse(data.name ?? "") as {
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
          sendDeckcraft({ source: "imageslide-poc", type: "export-finished" });
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
            sendDeckcraft({
              source: "imageslide-poc",
              type: "export-finished",
            });
        }
      } else if (data.type === "export-error" && exporting.current) {
        exporting.current = false;
        sendDeckcraft({ source: "imageslide-poc", type: "export-finished" });
        message.error(data.name || "スライドの書き出しに失敗しました");
      }
    };
    const unsubscribe = onDeckcraftEvent(onMessage);
    const { state } = deckcraftHost();
    for (const event of state.startup.values()) {
      if (event.type !== "ready") updateStartup(event);
    }
    if (state.ready) void onMessage({ type: "ready" });
    return () => {
      cancelled = true;
      // Reset the persistent host even if image decoding is still finishing.
      sendDeckcraft({ type: "export-finished" });
      exporting.current = false;
      unsubscribe();
    };
  }, [closeSession, file, session.id, setFiles, sourceSlides, updateStartup]);

  const close = () => {
    setSettingsOpen(false);
    closeSession(null);
  };
  return (
    <>
      <section
        className="relative flex min-h-0 flex-1 flex-col"
        aria-busy={loading && !editorError}
      >
        {editorError && (
          <div>
            <Button onClick={close}>戻る</Button>
            <Alert type="error" message={editorError} />
          </div>
        )}
        {!editorError && (
          <div
            ref={surface}
            className="min-h-[480px] w-full flex-1"
            aria-hidden={loading}
          />
        )}
        {loading && !editorError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
            <div className="w-full max-w-sm space-y-5" aria-live="polite">
              <h2 className="text-center text-lg font-medium">
                スライドを読み込んでいます
              </h2>
              {[
                {
                  label: "DeckCraft 本体",
                  status: wasmProgress.done || editorReady ? "done" : "loading",
                },
                {
                  label: "初期フォント",
                  status:
                    editorReady ||
                    (initialFonts &&
                      initialFonts.completed === initialFonts.total)
                      ? "done"
                      : "loading",
                },
                {
                  label: "エディターの初期化",
                  status: editorReady
                    ? "done"
                    : wasmProgress.done
                      ? "loading"
                      : "waiting",
                },
                ...(file
                  ? [{ label: "スライドのフォント", status: fontStatus }]
                  : []),
                {
                  label: "スライドを開く",
                  status: slideOpening ? "loading" : "waiting",
                },
              ].map(({ label, status }) => (
                <div
                  key={label}
                  className={status === "waiting" ? "opacity-50" : ""}
                >
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span>{label}</span>
                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      {status === "loading" &&
                        label === "DeckCraft 本体" &&
                        wasmProgress.received > 0 &&
                        `${(wasmProgress.received / 1048576).toFixed(1)} MB${wasmProgress.total ? ` / ${(wasmProgress.total / 1048576).toFixed(1)} MB` : ""}`}
                      {status === "loading" &&
                        label === "初期フォント" &&
                        initialFonts &&
                        `${initialFonts.completed} / ${initialFonts.total}`}
                      {status === "loading" &&
                        label === "スライドのフォント" &&
                        fontProgress &&
                        fontProgress.total > 0 &&
                        `${fontProgress.completed} / ${fontProgress.total}`}
                      {status === "loading" && (
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-label="読み込み中"
                        />
                      )}
                      {status === "done" && (
                        <>
                          <span>完了</span>
                          <Check className="size-4" aria-hidden="true" />
                        </>
                      )}
                      {status === "skipped" && "取得なし"}
                      {status === "failed" && "取得できませんでした"}
                      {status === "waiting" && "待機中"}
                    </span>
                  </div>
                  {status === "loading" && (
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      {label === "DeckCraft 本体" && wasmProgress.total ? (
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${Math.min(100, (wasmProgress.received / wasmProgress.total) * 100)}%`,
                          }}
                        />
                      ) : label === "初期フォント" &&
                        initialFonts &&
                        initialFonts.total > 0 ? (
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${(initialFonts.completed / initialFonts.total) * 100}%`,
                          }}
                        />
                      ) : label === "スライドのフォント" &&
                        fontProgress &&
                        fontProgress.total > 0 ? (
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${(fontProgress.completed / fontProgress.total) * 100}%`,
                          }}
                        />
                      ) : (
                        <div className="deckcraft-loading-bar h-full w-1/3 rounded-full bg-primary" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button onClick={close}>戻る</Button>
          </div>
        )}
      </section>
      <Modal
        title="出力設定"
        open={active && settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => {
          setSettingsOpen(false);
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
