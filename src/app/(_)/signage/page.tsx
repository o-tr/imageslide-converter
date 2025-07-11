"use client";
import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SlideRow from "./SlideRow";
import TransitionRow from "./TransitionRow";
import { SignboardConfig, TransitionType } from "./types";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const transitionTypes: { label: string; value: TransitionType }[] = [
  { label: "なし", value: "None" },
  { label: "上にスライド", value: "SlideUp" },
  { label: "下にスライド", value: "SlideDown" },
  { label: "左にスライド", value: "SlideLeft" },
  { label: "右にスライド", value: "SlideRight" },
  { label: "フェードイン", value: "FadeIn" },
];

function SignboardEditorPage() {
  const [signboards, setSignboards] = useState<SignboardConfig[]>([
    { name: "看板1", slides: [{ image: null, duration: 5, transition: "None" }], transitions: [] },
  ]);

  const slideCount = signboards[0]?.slides.length || 1;
  const durations = signboards[0]?.slides.map((s) => s.duration) || [5];

  // スライド数に合わせて各看板のtransitions配列を調整
  React.useEffect(() => {
    setSignboards((prev) =>
      prev.map((sb) => {
        let transitions = sb.transitions || [];
        if (slideCount > transitions.length) {
          transitions = [...transitions, ...Array(slideCount - transitions.length).fill("None")];
        } else if (slideCount < transitions.length) {
          transitions = transitions.slice(0, slideCount);
        }
        return { ...sb, transitions };
      })
    );
  }, [slideCount]);

  // 看板操作
  const addSignboard = () => {
    setSignboards([
      ...signboards,
      {
        name: `看板${signboards.length + 1}`,
        slides: Array.from({ length: slideCount }, (_, i) => ({ image: null, duration: durations[i] ?? 5, transition: "None" })),
        transitions: Array.from({ length: Math.max(slideCount - 1, 0) }, () => "None"),
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
        newSlides.splice(insertIdx, 0, { image: null, duration: 5, transition: "None" });
        const newTransitions = [...(sb.transitions || [])];
        newTransitions.splice(insertIdx, 0, "None");
        return { ...sb, slides: newSlides, transitions: newTransitions.slice(0, newSlides.length - 1) };
      });
    });
  };
  // 画像削除（全看板一括）
  const removeSlide = (idx: number) => {
    if (slideCount === 1) return;
    setSignboards((prev) => prev.map((sb) => {
      const newSlides = sb.slides.filter((_, i) => i !== idx);
      const newTransitions = (sb.transitions || []).filter((_, i) => i !== idx && i !== newSlides.length);
      return { ...sb, slides: newSlides, transitions: newTransitions.slice(0, newSlides.length) };
    }));
  };
  // 並び替え（看板ごとに独立）
  const moveSlide = (signboardIdx: number, from: number, to: number) => {
    if (to < 0 || to >= signboards[signboardIdx].slides.length) return;
    setSignboards((prev) => {
      const newBoards = [...prev];
      const sb = newBoards[signboardIdx];
      // スライド入れ替え
      const newSlides = [...sb.slides];
      const [movedSlide] = newSlides.splice(from, 1);
      newSlides.splice(to, 0, movedSlide);
      // トランジションも前後を正しく入れ替え
      let newTransitions = [...(sb.transitions || [])];
      if (from < to) {
        // 下に移動: fromの後ろのトランジションをfromの前に持ってくる
        if (from < newTransitions.length) {
          const [movedTrans] = newTransitions.splice(from, 1);
          newTransitions.splice(to, 0, movedTrans);
        }
      } else if (from > to) {
        // 上に移動: toの前のトランジションをtoの後ろに持ってくる
        if (to < newTransitions.length) {
          const [movedTrans] = newTransitions.splice(from - 1, 1);
          newTransitions.splice(to, 0, movedTrans);
        }
      }
      // transitions配列の長さを調整
      newTransitions = newTransitions.slice(0, newSlides.length);
      newBoards[signboardIdx] = { ...sb, slides: newSlides, transitions: newTransitions };
      return newBoards;
    });
  };
  // 秒数一括編集
  const handleDurationChange = (idx: number, value: string) => {
    setSignboards((prev) =>
      prev.map((sb) => ({
        ...sb,
        slides: sb.slides.map((s, i) => (i === idx ? { ...s, duration: Number(value) } : s)),
      }))
    );
  };
  // 値の編集
  const handleImageChange = (signboardIdx: number, idx: number, file: File | null) => {
    setSignboards((prev) => {
      const newBoards = [...prev];
      newBoards[signboardIdx] = {
        ...newBoards[signboardIdx],
        slides: newBoards[signboardIdx].slides.map((s, i) => (i === idx ? { ...s, image: file } : s)),
      };
      return newBoards;
    });
  };
  // トランジション個別編集
  const handleTransitionChangeBetween = (sbIdx: number, idx: number, value: TransitionType) => {
    setSignboards((prev) => prev.map((sb, i) =>
      i === sbIdx
        ? { ...sb, transitions: sb.transitions.map((t, j) => (j === idx ? value : t)) }
        : sb
    ));
  };
  // 設定データ取得用
  const getConfig = () => {
    return signboards.map((sb) => ({
      name: sb.name,
      slides: sb.slides.map((s) => ({
        image: s.image,
        duration: s.duration,
        transition: s.transition,
      })),
    }));
  };
  // 画像プレビュー用
  const getImagePreview = (file: File | null): string | undefined => {
    if (!file) return undefined;
    return URL.createObjectURL(file);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // DnDハンドラ
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = signboards[0].slides.map((_, idx) => `slide-${idx}`);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from === -1 || to === -1) return;
    setSignboards((prev) => prev.map((sb) => {
      const newSlides = arrayMove(sb.slides, from, to);
      let newTransitions = [...(sb.transitions || [])];
      // transitionsの並び替えも調整
      if (from < to) {
        if (from < newTransitions.length) {
          const [movedTrans] = newTransitions.splice(from, 1);
          newTransitions.splice(to, 0, movedTrans);
        }
      } else if (from > to) {
        if (to < newTransitions.length) {
          const [movedTrans] = newTransitions.splice(from - 1, 1);
          newTransitions.splice(to, 0, movedTrans);
        }
      }
      newTransitions = newTransitions.slice(0, newSlides.length);
      return { ...sb, slides: newSlides, transitions: newTransitions };
    }));
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
    const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
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
        {React.cloneElement(children, { dndHandle: <td {...listeners} style={{ cursor: disabled ? "default" : "grab", width: 24 }}><span title="ドラッグで並べ替え" style={{ userSelect: "none" }}>☰</span></td> })}
      </tr>
    );
  }

  return (
    <div className="max-w-full mx-auto p-6 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 dark:text-white">看板データ生成エディタ</h1>
      {/* 看板追加ボタン */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={addSignboard}
          className="px-3 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >＋看板追加</button>
      </div>
      {/* テーブル型グリッド */}
      <div className="overflow-x-auto">
        <table className="min-w-fit border-separate border-spacing-0">
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">#</th>
              <th className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-left">表示秒数</th>
              {signboards.map((sb, sbIdx) => (
                <th key={sbIdx} className="bg-gray-200 dark:bg-gray-700 px-4 py-2 text-leftmin-w-[320px]">
                  <div className="flex items-center gap-2">
                    <input
                      value={sb.name}
                      onChange={e => renameSignboard(sbIdx, e.target.value)}
                      className="bg-transparent w-32 text-lg font-bold outline-nonedark:text-blue-300"
                    />
                    {signboards.length > 1 && (
                      <button
                        onClick={() => removeSignboard(sbIdx)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ml-2"
                        title="看板を削除"
                      >×</button>
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
                  <React.Fragment key={`slide-row-${idx}`}>
                    <SlideRowSortable id={`slide-${idx}`} disabled={slideCount === 1}>
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
                    {idx < slideCount - 1 && (
                      <TransitionRow
                        idx={idx}
                        signboards={signboards}
                        handleTransitionChangeBetween={handleTransitionChangeBetween}
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
            onClick={() => addSlide()}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >画像を追加</button>
        </div>
      </div>
      <div className="mt-8">
        <button
          onClick={() => {
            const config = getConfig();
            alert(JSON.stringify(config, null, 2));
          }}
          className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
        >設定データを取得</button>
      </div>
    </div>
  );
}

export default SignboardEditorPage;
