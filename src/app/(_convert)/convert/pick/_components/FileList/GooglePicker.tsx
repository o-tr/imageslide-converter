import type { SelectedFile } from "@/_types/file-picker";
import type { GoogleFilePickerCallbackData } from "@/_types/lib/google/filePicker";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import {
  GooglePickerTokenAtom,
  IsGooglePickerReadyAtom,
} from "@/atoms/google-picker";
import { AntContent } from "@/components/AntContent";
import { file2selectedFiles, pdf2canvases } from "@/lib/file2selectedFiles";
import { fetchFileBuffer } from "@/lib/gapi/fetchFile";
import {
  fetchSlideAsPdf,
  fetchSlideMetadata,
  requestTokenPromise,
  showFilePicker,
} from "@/lib/google";
import { extractGifAnimations } from "@/lib/google/extractGifAnimations";
import { LoadingOutlined } from "@ant-design/icons";
import { Button, Flex, Spin, message } from "antd";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { TbBrandGoogleDrive } from "react-icons/tb";

export const GooglePicker = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [token, setToken] = useAtom(GooglePickerTokenAtom);
  const isApiLoaded = useAtomValue(IsGooglePickerReadyAtom);
  const setFiles = useSetAtom(SelectedFilesAtom);
  const [validating, setValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const showPicker = async (__token = token) => {
    const _token =
      __token ??
      (await (async () => {
        try {
          const token = await requestTokenPromise();
          setToken(token);
          return token;
        } catch (e) {
          console.error(e);
          return;
        }
      })());
    if (!_token) return;
    setValidating(true);
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user",
      {
        headers: {
          Authorization: `Bearer ${_token}`,
        },
      },
    ).then((res) => res.json());
    setValidating(false);
    if (response.user === undefined) {
      setToken(null);
      await showPicker(null);
      return;
    }
    void showFilePicker(_token, (data) => onFilePicked(data));
  };

  const onFilePicked = async (data: GoogleFilePickerCallbackData) => {
    if (data.action !== "picked" || !data.docs) return;
    const file = data.docs[0];
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    // True iff this invocation's controller is still the active one.
    // Guards against appending stale results when a newer pick has aborted us
    // while async work (which may not honor the signal) was still in flight.
    const isStillActive = () =>
      abortControllerRef.current === controller && !controller.signal.aborted;
    try {
      if (file.mimeType === "application/pdf") {
        const fileObj = new File(
          [await fetchFileBuffer(file.id)],
          file.name ?? "unknown file",
          {
            type: "application/pdf",
          },
        );
        const selectedFiles = await file2selectedFiles(fileObj);
        if (!isStillActive()) return;
        setFiles((pv) => [...pv, ...selectedFiles]);
      }
      if (file.mimeType === "application/vnd.google-apps.presentation") {
        const files = await slide2canvas(file.id, controller.signal);
        if (!isStillActive()) return;
        setFiles((pv) => [...pv, ...files]);
      }
      if (file.mimeType?.startsWith("image/")) {
        const buffer = await fetchFileBuffer(file.id);
        const fileObject = new File([buffer], file.name ?? "unknown file", {
          type: file.mimeType,
        });
        const canvas = await file2selectedFiles(fileObject);
        if (!isStillActive()) return;
        setFiles((pv) => [...pv, ...canvas]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.error(e);
      void messageApi.error(
        e instanceof Error
          ? e.message
          : "Failed to load file from Google Drive",
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  return (
    <>
      {contextHolder}
      <Button
        disabled={!isApiLoaded && !validating}
        icon={
          isApiLoaded && !validating ? (
            <TbBrandGoogleDrive />
          ) : (
            <Spin indicator={<LoadingOutlined spin />} />
          )
        }
        onClick={() => showPicker()}
      >
        Add File From Google Drive
      </Button>
      {isLoading && (
        <div
          className={
            "fixed top-0 left-0 w-full h-full z-50 grid place-items-center"
          }
        >
          <div
            className={
              "absolute left-0 top-0 w-full h-full bg-black bg-opacity-75 -z-0"
            }
          />
          <AntContent className={"relative p-8 rounded-2xl"}>
            <Flex gap={"middle"} align={"center"}>
              <Spin indicator={<LoadingOutlined spin />} size={"large"} />
              <div>Loading data from google drive...</div>
            </Flex>
          </AntContent>
        </div>
      )}
    </>
  );
};

// Wrap a non-cancellable promise so it rejects as soon as `signal` aborts.
// Underlying work (e.g. gapi calls) keeps running in the background, but
// awaiters bail out immediately rather than waiting for it to finish.
const raceWithAbort = <T,>(p: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return p;
  // signal.reason is undefined per spec when abort() is called without an
  // argument; fall back so `onFilePicked`'s `e instanceof DOMException` catch
  // still recognizes the rejection.
  const abortReason = () =>
    signal.reason ?? new DOMException("Aborted", "AbortError");
  if (signal.aborted) return Promise.reject(abortReason());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
};

const slide2canvas = async (
  slideId: string,
  signal?: AbortSignal,
): Promise<SelectedFile[]> => {
  const [{ canvases, buffer }, metadata] = await Promise.all([
    (async () => {
      const buffer = await raceWithAbort(fetchSlideAsPdf(slideId), signal);
      signal?.throwIfAborted();
      return {
        canvases: await raceWithAbort(pdf2canvases(buffer), signal),
        buffer,
      };
    })(),
    raceWithAbort(fetchSlideMetadata(slideId), signal),
  ]);
  signal?.throwIfAborted();

  const file = new File([buffer], metadata.title, {
    type: "application/pdf",
  });

  if (canvases.length !== metadata.items.length) {
    throw new Error(
      `Canvas count (${canvases.length}) does not match slide metadata count (${metadata.items.length}). The PDF export may not include all slides.`,
    );
  }

  const filteredSlides = canvases
    .map((canvas, index) => ({
      canvas,
      index,
      isSkipped: metadata.items[index].isSkipped,
      speakerNote: metadata.items[index].speakerNote,
      pageElements: metadata.items[index].pageElements,
    }))
    .filter(({ isSkipped }) => !isSkipped);

  // Process slides sequentially so the per-slide GIF_FETCH_CONCURRENCY cap in
  // extractGifAnimations actually bounds total proxy load (parallel Promise.all
  // across 30 slides would multiply that cap by the slide count).
  const results: SelectedFile[] = [];
  for (const [outputIndex, slide] of filteredSlides.entries()) {
    signal?.throwIfAborted();
    const { canvas, index, speakerNote, pageElements } = slide;
    const { animations, skipped } = await extractGifAnimations(
      pageElements,
      metadata.pageSize,
      { width: canvas.width, height: canvas.height },
      canvas,
      signal,
    );
    results.push({
      id: crypto.randomUUID(),
      fileName: `${metadata.title}-${outputIndex + 1}`,
      canvas,
      note: speakerNote,
      animations: animations.length > 0 ? animations : undefined,
      skippedAnimations: skipped.length > 0 ? skipped : undefined,
      metadata: {
        fileType: "pdf" as const,
        file,
        index,
        scale: 1,
      },
    });
  }
  return results;
};
