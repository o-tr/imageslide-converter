"use client";
import { ResultAtom } from "@/atoms/convert";
import { DeckCraftSessionAtom } from "@/atoms/deckcraft";
import { OutputFileNameAtom, SelectedFilesAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { Alert, Button, Flex, List, Spin } from "@/components/primitives";
import { getNormalFileId } from "@/lib/service/getNormalFileId";
import { getNormalPreSignedPut } from "@/lib/service/getNormalPreSignedPut";
import { postRegisterFile } from "@/lib/service/postRegisterFile";
import axios from "axios";
import { useAtomValue, useSetAtom } from "jotai";
import { type FC, useEffect, useState } from "react";
import { Completed } from "./Completed";
import { Preparing } from "./Preparing";

type Stage = "preparing" | "uploading" | "registering";

export const Upload: FC = () => {
  const result = useAtomValue(ResultAtom);
  const setResult = useSetAtom(ResultAtom);
  const session = useAtomValue(DeckCraftSessionAtom);
  const files = useAtomValue(SelectedFilesAtom);
  const outputFileName = useAtomValue(OutputFileNameAtom);
  const router = useRouter();
  const [progress, setProgress] = useState<Record<string, number>>({});
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
    setProgress({});
    setStage("preparing");

    // Defer the first request so Strict Mode's setup/cleanup cycle can cancel it.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        const data = result.data.map((input) => {
          const file = new File(
            [
              typeof input === "string"
                ? new TextEncoder().encode(input)
                : new Uint8Array(input),
            ],
            typeof input === "string" ? "file.txt" : "file.bin",
            {
              type:
                typeof input === "string"
                  ? "text/plain"
                  : "application/octet-stream",
            },
          );
          return { fileSize: file.size, file };
        });
        const fileId = await getNormalFileId(controller.signal);
        const preSignedPut = await getNormalPreSignedPut(
          fileId,
          data.map((input) => input.fileSize),
          controller.signal,
        );
        if (
          preSignedPut.length !== data.length ||
          new Set(preSignedPut.map((item) => item.index)).size !==
            data.length ||
          preSignedPut.some(
            (item) =>
              !Number.isInteger(item.index) ||
              item.index < 0 ||
              item.index >= data.length ||
              item.fileId !== fileId,
          )
        )
          throw new Error("Invalid upload URLs");
        if (cancelled) return;
        currentStage = "uploading";
        setStage(currentStage);
        setProgress(
          Object.fromEntries(
            preSignedPut.map(({ index }) => [`${fileId}_${index}`, 0]),
          ),
        );
        await Promise.all(
          preSignedPut.map(async (val) => {
            const { file } = data[val.index];
            await axios.put(val.url, file, {
              signal: controller.signal,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
              onUploadProgress: (event) => {
                if (!cancelled)
                  setProgress((previous) => ({
                    ...previous,
                    [`${fileId}_${val.index}`]: Math.min(
                      1,
                      event.loaded / (event.total || file.size || 1),
                    ),
                  }));
              },
            });
          }),
        );
        if (cancelled) return;
        currentStage = "registering";
        setStage(currentStage);
        await postRegisterFile(
          fileId,
          outputFileName || files[0]?.fileName || "untitled",
          data.length,
          data.reduce((sum, item) => sum + item.fileSize, 0),
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
      <div className="grid flex-1 place-items-center px-4">
        <div className="flex w-full max-w-lg flex-col items-center gap-4">
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
  if (stage === "preparing") return <Preparing />;
  if (stage === "registering") return <Completed />;
  return (
    <div className="grid flex-1 place-items-center">
      <List
        itemLayout="horizontal"
        dataSource={Object.entries(progress)}
        renderItem={(item) => (
          <List.Item>
            <Flex gap="middle" align="center">
              <Spin percent={Math.floor(item[1] * 100)} size="large" />
              <div>{item[0]}</div>
            </Flex>
          </List.Item>
        )}
      />
    </div>
  );
};
