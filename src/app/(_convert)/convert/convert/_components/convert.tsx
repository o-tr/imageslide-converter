"use client";
import type { WorkerResponse } from "@/_types/worker";
import { ResultAtom, TargetResolutionAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { useRouter } from "@/compat/navigation";
import { Alert, Button, Flex, Spin } from "@/components/primitives";
import {
  DEFAULT_FORMAT_ID,
  EIA_SIZE_LIMIT_ERROR,
  FileSizeLimit,
  OUTPUT_VERSION,
} from "@/const/convert";
import { postCompress } from "@/lib/workerService/postCompress";
import { useAtomValue, useSetAtom } from "jotai";
import { type FC, useEffect, useRef, useState } from "react";
import { RelationCanvas } from "./RelationCanvas";

export const Convert: FC = () => {
  const _files = useAtomValue(SelectedFilesAtom);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(_files.length);
  const [phase, setPhase] = useState<"prepare" | "plan" | "crop" | "compress">(
    "prepare",
  );
  const [graph, setGraph] = useState<Extract<
    WorkerResponse,
    { type: "compress-graph" }
  > | null>(null);
  const [failed, setFailed] = useState<boolean | "size-limit">(false);
  const _resolution = useAtomValue(TargetResolutionAtom);
  const setResults = useSetAtom(ResultAtom);
  const router = useRouter();

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    if (_files.length < 1) {
      router.push("./pick");
      return;
    }
    setTotal(_files.length);
    initRef.current = true;
    postCompress(
      _files,
      _resolution,
      (count, workerTotal, nextPhase) => {
        setCompleted(count);
        if (workerTotal > 0) setTotal(workerTotal);
        setPhase(nextPhase);
      },
      setGraph,
    )
      .then((result) => {
        setResults({
          data: result,
          format: DEFAULT_FORMAT_ID,
          version: OUTPUT_VERSION,
        });
        router.push("./upload");
      })
      .catch((e) => {
        setResults(undefined);
        initRef.current = false;
        console.error("Compression failed:", e);
        setFailed(
          e instanceof Error && e.message.includes(EIA_SIZE_LIMIT_ERROR)
            ? "size-limit"
            : true,
        );
      });
  }, [_files, _resolution, router, setResults]);
  if (failed) {
    return (
      <div className="grid flex-1 place-items-center px-4">
        <Flex vertical gap="middle" className="w-full max-w-lg">
          <Alert
            type="error"
            message={
              failed === "size-limit"
                ? `変換後のサイズが上限(${Math.floor(FileSizeLimit / 1024 / 1024)}MB)を超えました。スライド枚数を減らすか、解像度を下げてください。`
                : "変換に失敗しました"
            }
          />
          <Button onClick={() => router.push("/convert/pick")}>
            編集に戻る
          </Button>
        </Flex>
      </div>
    );
  }

  const phaseLabel = {
    prepare: "画像を準備中",
    plan: "似ているスライドを比較して親子関係を検討中",
    crop: "差分を抽出して親子関係を確定中",
    compress: "画像データを圧縮してファイルを作成中",
  }[phase];
  return (
    <div className="relative grid min-h-[600px] flex-1 place-items-center overflow-hidden">
      <RelationCanvas count={total} graph={graph} />
      <div className="relative z-10 max-w-md px-8 py-6 text-center [text-shadow:0_1px_8px_var(--background)]">
        <div className="flex justify-center">
          <Spin size="large" />
        </div>
        <div aria-live="polite">
          <h2 className="mt-4 text-xl font-semibold">
            ファイルを変換しています...
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {phaseLabel}
            {(phase === "prepare" || phase === "crop") &&
              `: ${completed} / ${total} ファイル`}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {graph
              ? `親子関係を確定: ${graph.stage === "final" ? total : (graph.resolved?.filter(Boolean).length ?? 0)} / ${total}`
              : "スライドの比較を準備しています"}
          </p>
          {graph?.rawBytes !== undefined &&
            graph.payloadBytes !== undefined &&
            graph.rawBytes > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                差分抽出後: 元画像の約{" "}
                {Math.round((graph.payloadBytes / graph.rawBytes) * 100)}
                %（圧縮前）
              </p>
            )}
          <p className="mt-3 text-xs text-muted-foreground">
            紫: 基準画像　緑: 親との差分　灰: 検討中
          </p>
        </div>
      </div>
    </div>
  );
};
