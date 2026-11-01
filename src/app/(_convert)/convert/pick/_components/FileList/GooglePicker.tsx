import type { GoogleFilePickerCallbackData } from "@/_types/lib/google/filePicker";
import { SetDeckCraftSessionAtom } from "@/atoms/deckcraft";
import {
  GooglePickerTokenAtom,
  IsGooglePickerReadyAtom,
} from "@/atoms/google-picker";
import { usePathname, useRouter } from "@/compat/navigation";
import { PageContent } from "@/components/PageContent";
import { Button, Flex, Spin, message } from "@/components/primitives";
import { LoadingOutlined } from "@/components/primitives-icons";
import { file2selectedFiles } from "@/lib/file2selectedFiles";
import { fetchFileBuffer } from "@/lib/gapi/fetchFile";
import { requestTokenPromise, showFilePicker } from "@/lib/google";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { TbBrandGoogleDrive } from "react-icons/tb";
import { PickerCard } from "./PickerCard";

export const GooglePicker = ({
  variant = "compact",
}: { variant?: "card" | "compact" }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [messageApi, contextHolder] = message.useMessage();
  const [token, setToken] = useAtom(GooglePickerTokenAtom);
  const isApiLoaded = useAtomValue(IsGooglePickerReadyAtom);
  const setSession = useSetAtom(SetDeckCraftSessionAtom);
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
    void showFilePicker(_token, (data) => onFilePicked(data, _token));
  };

  const onFilePicked = async (
    data: GoogleFilePickerCallbackData,
    accessToken: string,
  ) => {
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
        setSession({ kind: "slides", slides: selectedFiles });
        if (pathname !== "/convert/pick") router.push("/convert/pick");
      }
      if (
        file.mimeType ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(`PPTX の取得に失敗しました (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (!isStillActive()) return;
        setSession({
          kind: "pptx",
          file: new File([bytes], file.name ?? "presentation.pptx", {
            type: file.mimeType,
          }),
        });
        if (pathname !== "/convert/pick") router.push("/convert/pick");
      }
      if (file.mimeType === "application/vnd.google-apps.presentation") {
        const mime =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(mime)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error(`PPTX の書き出しに失敗しました (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (!isStillActive()) return;
        setSession({
          kind: "pptx",
          file: new File([bytes], `${file.name ?? "presentation"}.pptx`, {
            type: mime,
          }),
        });
        if (pathname !== "/convert/pick") router.push("/convert/pick");
      }
      if (file.mimeType?.startsWith("image/")) {
        const buffer = await fetchFileBuffer(file.id);
        const fileObject = new File([buffer], file.name ?? "unknown file", {
          type: file.mimeType,
        });
        const canvas = await file2selectedFiles(fileObject);
        if (!isStillActive()) return;
        setSession({ kind: "slides", slides: canvas });
        if (pathname !== "/convert/pick") router.push("/convert/pick");
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
      {variant === "card" ? (
        <PickerCard
          icon={<TbBrandGoogleDrive />}
          title="Google Drive から選択"
          description="Google スライドや Drive 内のファイルを開きます。"
          disabled={!isApiLoaded || validating}
          onClick={() => showPicker()}
        />
      ) : (
        <Button
          disabled={!isApiLoaded || validating}
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
      )}
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
          <PageContent className={"relative p-8 rounded-2xl"}>
            <Flex gap={"middle"} align={"center"}>
              <Spin indicator={<LoadingOutlined spin />} size={"large"} />
              <div>Loading data from google drive...</div>
            </Flex>
          </PageContent>
        </div>
      )}
    </>
  );
};
