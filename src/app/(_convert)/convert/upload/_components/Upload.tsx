"use client";
import { ResultAtom } from "@/atoms/convert";
import { DeckCraftSessionAtom } from "@/atoms/deckcraft";
import { OutputFileNameAtom, SelectedFilesAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { Alert, Button } from "@/components/primitives";
import { getNormalFileId } from "@/lib/service/getNormalFileId";
import { getNormalPreSignedPut } from "@/lib/service/getNormalPreSignedPut";
import { postRegisterFile } from "@/lib/service/postRegisterFile";
import { sha256Base64 } from "@/lib/sha256Base64";
import axios from "axios";
import { useAtomValue, useSetAtom } from "jotai";
import { type FC, useEffect, useState } from "react";
import { ConversionStatus } from "../../_components/ConversionStatus";

type Stage = "preparing" | "uploading" | "registering";

export const Upload: FC = () => {
  const result = useAtomValue(ResultAtom);
  const setResult = useSetAtom(ResultAtom);
  const session = useAtomValue(DeckCraftSessionAtom);
  const files = useAtomValue(SelectedFilesAtom);
  const outputFileName = useAtomValue(OutputFileNameAtom);
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<Stage>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt starts a fresh upload after a retry.
  useEffect(() => {
    if (!result || result.data.length === 0) {
      router.replace("/convert/pick");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let currentStage: Stage = "preparing";
    setError(null);
    setProgress(0);
    setStage("preparing");

    // Defer the first request so Strict Mode's setup/cleanup cycle can cancel it.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        const file = new File([new Uint8Array(result.data)], "file.bin", {
          type: "application/octet-stream",
        });
        const fileId = await getNormalFileId(controller.signal);
        const preSignedPut = await getNormalPreSignedPut(
          fileId,
          file.size,
          await sha256Base64(result.data),
          controller.signal,
        );
        if (preSignedPut.fileId !== fileId)
          throw new Error("Invalid upload URL");
        if (cancelled) return;
        currentStage = "uploading";
        setStage(currentStage);
        await axios.put(preSignedPut.url, file, {
          signal: controller.signal,
          headers: { "Content-Type": "application/octet-stream" },
          onUploadProgress: (event) => {
            if (!cancelled)
              setProgress(
                Math.min(1, event.loaded / (event.total || file.size || 1)),
              );
          },
        });
        if (cancelled) return;
        currentStage = "registering";
        setStage(currentStage);
        await postRegisterFile(
          fileId,
          outputFileName || files[0]?.fileName || "untitled",
          file.size,
          result.format,
          result.version,
          controller.signal,
        );
        if (!cancelled) router.replace(`/files/${fileId}`);
      } catch (cause) {
        if (cancelled) return;
        controller.abort();
        console.error("Upload failed:", cause);
        const action =
          currentStage === "preparing"
            ? "アップロードの準備"
            : currentStage === "uploading"
              ? "ファイルの送信"
              : "ファイルの登録";
        const status =
          axios.isAxiosError(cause) && cause.response
            ? `（HTTP ${cause.response.status}）`
            : "";
        setError(
          `${action}に失敗しました${status}。時間をおいて再試行してください。`,
        );
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [result, files, router, outputFileName, attempt]);

  if (error) {
    return (
      <div className="fixed inset-0 z-[90] grid place-items-center px-4">
        <div
          data-relation-label
          className="flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border bg-background p-6 shadow-lg"
        >
          <Alert type="error" message={error} />
          <Button
            type="primary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            アップロードを再試行
          </Button>
          <Button
            onClick={() => {
              router.push("/convert/pick");
              setResult(undefined);
            }}
          >
            {session ? "キャンセルして編集に戻る" : "キャンセルして戻る"}
          </Button>
        </div>
      </div>
    );
  }
  const title =
    stage === "preparing"
      ? "アップロードを準備しています"
      : stage === "uploading"
        ? "アップロードしています"
        : "ファイルを登録しています";
  const detail =
    stage === "preparing"
      ? "ファイルの確認と送信先の準備中"
      : stage === "uploading"
        ? "変換したファイルを送信中"
        : "サーバーの応答を待っています";
  return (
    <ConversionStatus
      title={title}
      detail={detail}
      stage={3}
      progress={stage === "uploading" ? progress : undefined}
    />
  );
};
