"use client";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { SignageConvertAtom } from "@/atoms/signage-convert";
import { Button } from "@/components/ui/button";
import { DndContext } from "@dnd-kit/core";
import { Radio } from "antd";
import { useSetAtom } from "jotai";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { SignboardTableHeader } from "./_components/SignboardTableHeader";
import SlideRow from "./_components/SlideRow";
import TransitionRow from "./_components/TransitionRow";
import { TRANSITION_TYPES } from "./_components/constants";
import { ManifestGenerator } from "./_components/manifestGenerator";
import { useDragAndDrop } from "./_components/useDragAndDrop";
import { useSignboardConfig } from "./_components/useSignboardConfig";

function SignboardEditorPage() {
  const setSignageConvert = useSetAtom(SignageConvertAtom);
  const setSelectedFiles = useSetAtom(SelectedFilesAtom);
  const router = useRouter();
  const [selectedFormat, setSelectedFormat] = useState<
    "eia-v1-RGB24-cropped" | "eia-v1-RGB24-cropped-base64"
  >("eia-v1-RGB24-cropped");

  const {
    config,
    slideCount,
    durations,
    addSignboard,
    removeSignboard,
    renameSignboard,
    addSlide,
    removeSlide,
    handleDurationChange,
    handleImageChange,
    handleTransitionChangeBetween,
    swapImages,
  } = useSignboardConfig();

  const { sensors, handleDragEnd, collisionDetection } =
    useDragAndDrop(swapImages);

  const handleGenerateData = async () => {
    const manifestGenerator = new ManifestGenerator();
    const { manifest, files } =
      await manifestGenerator.generateManifest(config);

    setSignageConvert({
      signage: manifest,
      files: files,
      format: selectedFormat,
    });
    setSelectedFiles(files);
    router.push("/signage/convert");
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
          <SignboardTableHeader
            config={config}
            renameSignboard={renameSignboard}
            removeSignboard={removeSignboard}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
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
                      transitionTypes={TRANSITION_TYPES}
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
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">
            フォーマットを選択してください
          </h3>
          <Radio.Group
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
          >
            <Radio.Button value="eia-v1-RGB24-cropped">
              EIA v1 RGB24 (cropped)
            </Radio.Button>
            <Radio.Button value="eia-v1-RGB24-cropped-base64">
              EIA v1 RGB24 (cropped, base64)
            </Radio.Button>
          </Radio.Group>
        </div>
        <Button onClick={handleGenerateData}>設定データを取得</Button>
      </div>
    </div>
  );
}

export default SignboardEditorPage;
