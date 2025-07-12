"use client";
import type { EIASignageItem, EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { Button } from "@/components/ui/button";
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
import { Trash } from "lucide-react";
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
  // 並び替え（スライドのみ）
  const moveSlide = (signboardIdx: number, from: number, to: number) => {
    if (to < 0 || to >= config.rows.length) return;
    setConfig((prev) => {
      const newRows = [...prev.rows];
      const [movedRow] = newRows.splice(from, 1);
      newRows.splice(to, 0, movedRow);
      return {
        ...prev,
        rows: newRows.map((row, i) => ({ ...row, rowIndex: i })),
      };
    });
  };
  // 秒数一括編集
  const handleDurationChange = (idx: number, value: string) => {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === idx
          ? {
              ...row,
              images: row.images.map((img) => ({
                ...img,
                duration: Number(value),
              })),
            }
          : row,
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
    console.log("swapImages_rot", fromId, toRow, toCol);
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
      console.log(
        `from: ${fromId} at (${fromRow}, ${fromCol}), to: (${toRow}, ${toCol})`,
      );
      if (!fromFile) {
        console.error("File not found for id:", fromId, prev);
        return prev;
      }
      if (fromCol === toCol && fromRow === toRow) {
        console.log("No swap needed, same position", prev);
        return prev;
      }
      const toFile = newRows[toRow].images[toCol];
      newRows[fromRow].images[fromCol] = toFile;
      newRows[toRow].images[toCol] = fromFile;
      return { ...prev, rows: newRows };
    });
  };
  // 設定データ取得用
  const getConfig = () => {
    return config;
  };
  // 画像プレビュー用
  const getImagePreview = (file: File | null): string | undefined => {
    if (!file) return undefined;
    return URL.createObjectURL(file);
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
      <h1 className="text-2xl font-bold mb-4 dark:text-white">
        看板データ生成エディタ
      </h1>
      {/* 看板追加ボタン */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={addSignboard}
          className="px-3 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          ＋看板追加
        </button>
      </div>
      {/* テーブル型グリッド */}
      <div className="overflow-x-auto">
        <table className="min-w-fit border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">
                #
              </th>
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">
                表示秒数
              </th>
              {config.signboards.map((sb, sbIdx) => (
                <th
                  key={sb.id}
                  className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-leftmin-w-[320px]"
                >
                  <div className="flex justify-between items-center">
                    <input
                      value={sb.name}
                      onChange={(e) => renameSignboard(sbIdx, e.target.value)}
                      className="bg-transparent w-32 text-lg font-bold outline-nonedark:text-blue-300"
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
              <th className="px-4 py-2 text-left"> </th>
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
                    getImagePreview={getImagePreview}
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
          <button
            type="button"
            onClick={() => addSlide()}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            画像を追加
          </button>
        </div>
      </div>
      <div className="mt-8">
        <button
          type="button"
          onClick={() => {
            const configData = getConfig();
            const manifest: EIASignageManifest = configData.signboards.reduce(
              (acc, sb, sbIdx) => {
                acc[sb.name] = configData.rows.map<EIASignageItem>(
                  (row, idx) => ({
                    f: `${idx}`,
                    t: row.images[sbIdx]?.transition || "None",
                    d: row.duration,
                  }),
                );
                return acc;
              },
              {} as EIASignageManifest,
            );
            const files = configData.rows
              .flatMap((row) => row.images.map((img) => img.file))
              .filter((file): file is SelectedFile => file !== null);
            setSignageConvert({
              signage: manifest,
              files: files,
            });
            setSelectedFiles(files);
            router.push("/signage/convert");
          }}
          className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
        >
          設定データを取得
        </button>
      </div>
    </div>
  );
}

export default SignboardEditorPage;
