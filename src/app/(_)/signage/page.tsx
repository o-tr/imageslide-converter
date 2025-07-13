"use client";
import type { EIASignageItem, EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { img2selectedFiles } from "@/lib/file2selectedFiles/img2selectedFiles";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useSetAtom } from "jotai";
import { PlusCircle, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import SlideRow from "./SlideRow";
import TransitionRow from "./TransitionRow";
import type { SignboardConfig, SlideConfig, TransitionType } from "./types";

const transitionTypes: { label: string; value: TransitionType }[] = [
  { label: "なし", value: "None" },
  { label: "上にスライド", value: "SlideUp" },
  { label: "下にスライド", value: "SlideDown" },
  { label: "左にスライド", value: "SlideLeft" },
  { label: "右にスライド", value: "SlideRight" },
  { label: "フェードイン", value: "FadeIn" },
];

const createSignboardImage = (): SlideConfig => ({
  id: crypto.randomUUID(),
  file: null,
  transition: "None",
});

function SignboardEditorPage() {
  const [config, setConfig] = useState<SignboardConfig>({
    signboards: [{ name: "看板1", id: crypto.randomUUID() }],
    rows: [
      {
        id: crypto.randomUUID(),
        rowIndex: 0,
        duration: 10,
        images: [createSignboardImage()],
      },
    ],
  });
  const setSignageConvert = useSetAtom(SignageConvertAtom);
  const setSelectedFiles = useSetAtom(SelectedFilesAtom);
  const router = useRouter();

  const slideCount = config.rows.length;
  const durations = config.rows.map((row) => row.duration);

  // transitions配列の管理は不要になったため削除

  // 看板操作
  const addSignboard = () => {
    setConfig((prev) => ({
      ...prev,
      signboards: [
        ...prev.signboards,
        { id: crypto.randomUUID(), name: `看板${prev.signboards.length + 1}` },
      ],
      rows: prev.rows.map((row) => ({
        ...row,
        images: [...row.images, createSignboardImage()],
      })),
    }));
  };
  const removeSignboard = (idx: number) => {
    if (config.signboards.length === 1) return;
    setConfig((prev) => ({
      ...prev,
      signboards: prev.signboards.filter((_, i) => i !== idx),
      rows: prev.rows.map((row) => ({
        ...row,
        images: row.images.filter((_, i) => i !== idx),
      })),
    }));
  };
  const renameSignboard = (idx: number, name: string) => {
    setConfig((prev) => ({
      ...prev,
      signboards: prev.signboards.map((sb, i) =>
        i === idx ? { ...sb, name } : sb,
      ),
    }));
  };

  // スライド操作
  // 画像追加
  const addSlide = (atIdx?: number) => {
    setConfig((prev) => {
      const insertIdx = atIdx !== undefined ? atIdx : prev.rows.length;
      const newRow = {
        id: crypto.randomUUID(),
        rowIndex: insertIdx,
        duration: 10,
        images: Array.from({ length: prev.signboards.length }, () =>
          createSignboardImage(),
        ),
      };
      const newRows = [...prev.rows];
      newRows.splice(insertIdx, 0, newRow);
      // rowIndexを再調整
      return {
        ...prev,
        rows: newRows.map((row, i) => ({ ...row, rowIndex: i })),
      };
    });
  };
  // 画像削除（全看板一括）
  const removeSlide = (idx: number) => {
    if (slideCount === 1) return;
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows
        .filter((_, i) => i !== idx)
        .map((row, i) => ({ ...row, rowIndex: i })),
    }));
  };
  // 秒数一括編集
  const handleDurationChange = (idx: number, value: number) => {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === idx ? { ...row, duration: value } : row,
      ),
    }));
  };
  // 値の編集
  const handleImageChange = async (
    signboardIdx: number,
    idx: number,
    file: File | null,
  ) => {
    const selectedFiles = file
      ? await img2selectedFiles(file).then((files) => files[0])
      : null;
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === idx
          ? {
              ...row,
              images: row.images.map((img, j) =>
                j === signboardIdx ? { ...img, file: selectedFiles } : img,
              ),
            }
          : row,
      ),
    }));
  };
  // トランジション個別編集（slides[idx].transitionを直接更新）
  const handleTransitionChangeBetween = (
    sbIdx: number,
    idx: number,
    value: TransitionType,
  ) => {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === idx
          ? {
              ...row,
              images: row.images.map((img, j) =>
                j === sbIdx ? { ...img, transition: value } : img,
              ),
            }
          : row,
      ),
    }));
  };
  // 画像単位DND
  const swapImages = (fromId: string, toRow: number, toCol: number) => {
    setConfig((prev) => {
      const newRows = [...prev.rows];
      const { fromFile, fromCol, fromRow } = (() => {
        for (let row = 0; row < newRows.length; row++) {
          const col = newRows[row].images.findIndex((img) => img.id === fromId);
          if (col !== -1) {
            return {
              fromFile: newRows[row].images[col],
              fromCol: col,
              fromRow: row,
            };
          }
        }
        return { fromFile: null, fromCol: -1, fromRow: -1 };
      })();
      if (!fromFile) {
        return prev;
      }
      if (fromCol === toCol && fromRow === toRow) {
        return prev;
      }
      const toFile = newRows[toRow].images[toCol];
      newRows[fromRow].images[fromCol] = toFile;
      newRows[toRow].images[toCol] = fromFile;
      return { ...prev, rows: newRows };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // 画像セル単位DND: セルidからrow,colを特定しswapImages
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromElem = document.getElementById(String(active.id));
    const overElem = document.getElementById(String(over.id));
    if (!fromElem || !overElem) return;
    const fromId = fromElem.getAttribute("data-item-id");
    const overRow = overElem.getAttribute("data-item-row");
    const overCol = overElem.getAttribute("data-item-col");
    if (!fromId || !overRow || !overCol) {
      return;
    }
    swapImages(fromId, Number.parseInt(overRow), Number.parseInt(overCol));
  };

  return (
    <div className="max-w-full mx-auto p-6 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">看板データ生成エディタ</h1>
      <div className="mb-6 flex gap-2">
        <Button onClick={addSignboard} variant={"outline"}>
          <PlusCircle /> 看板追加
        </Button>
      </div>
      {/* テーブル型グリッド */}
      <div className="overflow-x-auto">
        <table className="min-w-fit border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left min-w-[100px] w-[100px] max-w-[100px]">
                表示秒数
              </th>
              {config.signboards.map((sb, sbIdx) => (
                <th
                  key={sb.id}
                  className="text-left max-w-[320px] min-w-[320px] w-[320px]"
                >
                  <div className="flex justify-between items-center">
                    <Input
                      value={sb.name}
                      onChange={(e) => renameSignboard(sbIdx, e.target.value)}
                    />
                    {config.signboards.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeSignboard(sbIdx)}
                        variant={"destructive"}
                        size={"sm"}
                      >
                        <Trash />
                      </Button>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-4 py-2 text-left" />
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <tbody>
              {config.rows.map((row, rowIdx) => (
                <React.Fragment key={row.id}>
                  <SlideRow
                    idx={rowIdx}
                    durations={durations}
                    signboards={config}
                    handleDurationChange={handleDurationChange}
                    handleImageChange={handleImageChange}
                    removeSlide={removeSlide}
                    slideCount={slideCount}
                  />
                  {slideCount > 1 && (
                    <TransitionRow
                      idx={rowIdx}
                      signboards={config}
                      handleTransitionChangeBetween={
                        handleTransitionChangeBetween
                      }
                      transitionTypes={transitionTypes}
                    />
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </DndContext>
        </table>
        <div className="mt-4">
          <Button onClick={() => addSlide()} variant={"outline"}>
            <PlusCircle />
            画像を追加
          </Button>
        </div>
      </div>
      <div className="mt-8">
        <Button
          onClick={async () => {
            async function getFileBuffer(
              file: SelectedFile,
            ): Promise<ArrayBuffer> {
              if (
                !file.canvas ||
                typeof OffscreenCanvas === "undefined" ||
                !(file.canvas instanceof OffscreenCanvas)
              ) {
                throw new Error("SelectedFile.canvas is not OffscreenCanvas");
              }
              const ctx = file.canvas.getContext("2d");
              if (!ctx)
                throw new Error("OffscreenCanvas 2d context not available");
              const imageData = ctx.getImageData(
                0,
                0,
                file.canvas.width,
                file.canvas.height,
              );
              // imageData.data.bufferがSharedArrayBufferの場合はArrayBufferに変換
              const buf = imageData.data.buffer;
              if (buf instanceof ArrayBuffer) {
                return buf.slice(0);
              }
              // SharedArrayBuffer等はUint8Array経由でArrayBuffer化
              const u8 = new Uint8Array(buf);
              const ab = new ArrayBuffer(u8.length);
              new Uint8Array(ab).set(u8);
              return ab;
            }

            // キャッシュはWeakMapでSelectedFileごとに管理
            const sha256Cache = new WeakMap<SelectedFile, string>();
            async function calcFileHash(file: SelectedFile): Promise<string> {
              const cached = sha256Cache.get(file);
              if (cached) return cached;
              const buffer = await getFileBuffer(file);
              const hashBuffer = await window.crypto.subtle.digest(
                "SHA-256",
                buffer,
              );
              const hash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
              sha256Cache.set(file, hash);
              return hash;
            }

            // 画像の重複排除: ファイルのSHA-256で一意化
            const fileMap = new Map<string, SelectedFile>();
            // hash計算を先に全て行い、imgごとにhashを保持
            const imgHashes: string[][] = [];
            for (const row of config.rows) {
              const rowHashes: string[] = [];
              for (const img of row.images) {
                if (img.file) {
                  const hash = await calcFileHash(img.file);
                  rowHashes.push(hash);
                  if (!fileMap.has(hash)) {
                    fileMap.set(hash, img.file);
                  }
                } else {
                  rowHashes.push("");
                }
              }
              imgHashes.push(rowHashes);
            }
            // files: 重複を除いたSelectedFile配列
            const files = Array.from(fileMap.values());
            // hash→indexマップ
            const hashToIndex = new Map<string, number>();
            files.forEach((file, idx) => {
              calcFileHash(file).then((hash) => {
                hashToIndex.set(hash, idx);
              });
            });
            await Promise.all(files.map((file) => calcFileHash(file)));
            files.forEach((file, idx) => {
              const hash = [...fileMap.entries()].find(
                ([, v]) => v === file,
              )?.[0];
              if (hash) hashToIndex.set(hash, idx);
            });
            // manifest生成: imgHashesからfilesのindexを参照
            const manifest: EIASignageManifest = config.signboards.reduce(
              (acc, sb, sbIdx) => {
                acc[sb.name] = config.rows.map<EIASignageItem>(
                  (row, rowIdx) => {
                    const hash = imgHashes[rowIdx][sbIdx];
                    const fileIdx =
                      hash && hashToIndex.has(hash)
                        ? hashToIndex.get(hash)
                        : undefined;
                    return {
                      f: fileIdx !== undefined ? String(fileIdx) : "",
                      t: row.images[sbIdx]?.transition || "None",
                      d: row.duration,
                    };
                  },
                );
                return acc;
              },
              {} as EIASignageManifest,
            );
            setSignageConvert({
              signage: manifest,
              files: files,
            });
            setSelectedFiles(files);
            router.push("/signage/convert");
          }}
        >
          設定データを取得
        </Button>
      </div>
    </div>
  );
}

export default SignboardEditorPage;
