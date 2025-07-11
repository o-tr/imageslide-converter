"use client";
import type { EIASignageItem, EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { img2selectedFiles } from "@/lib/file2selectedFiles/img2selectedFiles";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSetAtom } from "jotai";
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
  duration: 5,
  transition: "None",
});

function SignboardEditorPage() {
  const [signboards, setSignboards] = useState<SignboardConfig[]>([
    {
      name: "看板1",
      slides: [createSignboardImage()],
    },
  ]);
  const setSignageConvert = useSetAtom(SignageConvertAtom);
  const router = useRouter();

  const slideCount = signboards[0]?.slides.length || 1;
  const durations = signboards[0]?.slides.map((s) => s.duration) || [5];

  // transitions配列の管理は不要になったため削除

  // 看板操作
  const addSignboard = () => {
    setSignboards([
      ...signboards,
      {
        name: `看板${signboards.length + 1}`,
        slides: Array.from({ length: slideCount }, (_, i) =>
          createSignboardImage(),
        ),
      },
    ]);
  };
  const removeSignboard = (idx: number) => {
    if (signboards.length === 1) return;
    setSignboards(signboards.filter((_, i) => i !== idx));
  };
  const renameSignboard = (idx: number, name: string) => {
    const newBoards = [...signboards];
    newBoards[idx].name = name;
    setSignboards(newBoards);
  };

  // スライド操作
  // 画像追加
  const addSlide = (atIdx?: number) => {
    setSignboards((prev) => {
      const insertIdx = atIdx !== undefined ? atIdx : prev[0].slides.length;
      return prev.map((sb) => {
        const newSlides = [...sb.slides];
        newSlides.splice(insertIdx, 0, createSignboardImage());
        return {
          ...sb,
          slides: newSlides,
        };
      });
    });
  };
  // 画像削除（全看板一括）
  const removeSlide = (idx: number) => {
    if (slideCount === 1) return;
    setSignboards((prev) =>
      prev.map((sb) => {
        const newSlides = sb.slides.filter((_, i) => i !== idx);
        return {
          ...sb,
          slides: newSlides,
        };
      }),
    );
  };
  // 並び替え（看板ごとに独立）
  // 並び替え（スライドのみ）
  const moveSlide = (signboardIdx: number, from: number, to: number) => {
    if (to < 0 || to >= signboards[signboardIdx].slides.length) return;
    setSignboards((prev) => {
      const newBoards = [...prev];
      const sb = newBoards[signboardIdx];
      const newSlides = [...sb.slides];
      const [movedSlide] = newSlides.splice(from, 1);
      newSlides.splice(to, 0, movedSlide);
      newBoards[signboardIdx] = {
        ...sb,
        slides: newSlides,
      };
      return newBoards;
    });
  };
  // 秒数一括編集
  const handleDurationChange = (idx: number, value: string) => {
    setSignboards((prev) =>
      prev.map((sb) => ({
        ...sb,
        slides: sb.slides.map((s, i) =>
          i === idx ? { ...s, duration: Number(value) } : s,
        ),
      })),
    );
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
    setSignboards((prev) => {
      const newBoards = [...prev];
      newBoards[signboardIdx] = {
        ...newBoards[signboardIdx],
        slides: newBoards[signboardIdx].slides.map((s, i) =>
          i === idx ? { ...s, file: selectedFiles } : s,
        ),
      };
      return newBoards;
    });
  };
  // トランジション個別編集（slides[idx].transitionを直接更新）
  const handleTransitionChangeBetween = (
    sbIdx: number,
    idx: number,
    value: TransitionType,
  ) => {
    setSignboards((prev) =>
      prev.map((sb, i) =>
        i === sbIdx
          ? {
              ...sb,
              slides: sb.slides.map((s, j) =>
                j === idx ? { ...s, transition: value } : s,
              ),
            }
          : sb,
      ),
    );
  };
  // 設定データ取得用
  const getConfig = () => {
    return signboards;
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

  // DnDハンドラ
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = signboards[0].slides.map((_, idx) => `slide-${idx}`);
    const from = ids.indexOf(active.id.toString());
    const to = ids.indexOf(over.id.toString());
    if (from === -1 || to === -1) return;
    setSignboards((prev) =>
      prev.map((sb) => {
        const newSlides = arrayMove(sb.slides, from, to);
        return { ...sb, slides: newSlides };
      }),
    );
  };

  function SlideRowSortable({
    id,
    children,
    disabled,
  }: {
    id: string;
    children: React.ReactElement;
    disabled?: boolean;
  }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
      useSortable({
        id,
        disabled,
      });
    const style = {
      transform: CSS.Transform.toString(transform),
      opacity: isDragging ? 0.5 : 1,
      background: isDragging ? "#e0e7ef" : undefined,
    };
    return (
      <tr ref={setNodeRef} style={style} {...attributes}>
        {React.cloneElement(children, {
          dndHandle: (
            <td
              {...listeners}
              style={{ cursor: disabled ? "default" : "grab", width: 24 }}
            >
              <span title="ドラッグで並べ替え" style={{ userSelect: "none" }}>
                ☰
              </span>
            </td>
          ),
        })}
      </tr>
    );
  }

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
              <th style={{ width: 24 }} />
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">
                #
              </th>
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">
                表示秒数
              </th>
              {signboards.map((sb, sbIdx) => (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                  key={sbIdx}
                  className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-leftmin-w-[320px]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={sb.name}
                      onChange={(e) => renameSignboard(sbIdx, e.target.value)}
                      className="bg-transparent w-32 text-lg font-bold outline-nonedark:text-blue-300"
                    />
                    {signboards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSignboard(sbIdx)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ml-2"
                        title="看板を削除"
                      >
                        削除
                      </button>
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
            <SortableContext
              items={signboards[0].slides.map((_, idx) => `slide-${idx}`)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {signboards[0].slides.map((_, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                  <React.Fragment key={`slide-row-${idx}`}>
                    <SlideRowSortable
                      id={`slide-${idx}`}
                      disabled={slideCount === 1}
                    >
                      <SlideRow
                        idx={idx}
                        durations={durations}
                        signboards={signboards}
                        handleDurationChange={handleDurationChange}
                        handleImageChange={handleImageChange}
                        removeSlide={removeSlide}
                        slideCount={slideCount}
                        getImagePreview={getImagePreview}
                      />
                    </SlideRowSortable>
                    {slideCount > 1 && (
                      <TransitionRow
                        idx={idx}
                        signboards={signboards}
                        handleTransitionChangeBetween={
                          handleTransitionChangeBetween
                        }
                        transitionTypes={transitionTypes}
                      />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </SortableContext>
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
            const config = getConfig();
            const manfiest: EIASignageManifest = config.reduce((acc, sb) => {
              acc[sb.name] = sb.slides.map<EIASignageItem>((slide, idx) => ({
                f: `${idx}`,
                t: slide.transition,
                d: slide.duration,
              }));
              return acc;
            }, {} as EIASignageManifest);
            setSignageConvert({
              signage: manfiest,
              files: config
                .flatMap((sb) => sb.slides.map((slide) => slide.file))
                .filter((file): file is SelectedFile => file !== null),
            });
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
