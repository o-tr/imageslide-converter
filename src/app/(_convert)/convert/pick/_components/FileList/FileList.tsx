"use client";
import { HeaderLogo } from "@/app/(_)/_components/HeaderLogo";
import { OutputFileNameAtom, SelectedFilesAtom } from "@/atoms/file-drop";
import { SettingOutlined } from "@ant-design/icons";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button, Flex, Input, Modal } from "antd";
import { useAtom } from "jotai";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SettingsPanel } from "../Settings";
import { Controls } from "./Controls";
import { GooglePicker } from "./GooglePicker";
import { LocalFilePicker } from "./LocalFilePicker";
import { MainPreviewArea } from "./MainPreviewArea";
import { SlideSidePanel } from "./SlideSidePanel";

const Logo = () => (
  <Link href={"/"}>
    <div className={"flex items-center gap-2"}>
      <Image src={"/icon.png"} alt={"logo"} width={24} height={24} />
      <span className={"font-semibold text-sm hidden sm:block text-primary"}>
        ImageSlide Converter
      </span>
    </div>
  </Link>
);

export const FileList = () => {
  const [files, setFiles] = useAtom(SelectedFilesAtom);
  const [fileName, setFileName] = useAtom(OutputFileNameAtom);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedIdRef = useRef<string>(files[0]?.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (files.length === 0) return;
    const newIdx = files.findIndex((f) => f.id === selectedIdRef.current);
    setSelectedIndex(newIdx >= 0 ? newIdx : 0);
  }, [files]);

  const handleDelete = (id: string) => {
    if (selectedIdRef.current === id) {
      const idx = files.findIndex((f) => f.id === id);
      const newFiles = files.filter((f) => f.id !== id);
      const newIdx = Math.min(idx, newFiles.length - 1);
      selectedIdRef.current = newFiles[newIdx]?.id ?? "";
      setSelectedIndex(Math.max(0, newIdx));
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleNoteChange = (id: string, note: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, note } : f)));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setFiles((prev) => {
      const from = prev.findIndex((f) => f.id === active.id);
      const to = prev.findIndex((f) => f.id === over.id);
      return arrayMove(prev, from, to);
    });
  };

  const onSelect = (index: number) => {
    selectedIdRef.current = files[index]?.id;
    setSelectedIndex(index);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={files.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={"flex flex-col flex-1 overflow-hidden"}>
            {/* Header bar */}

            {/* Content area */}
            {files.length === 0 ? (
              <>
                <HeaderLogo />
                <div className={"flex-1 grid place-items-center"}>
                  <Flex vertical gap={"middle"}>
                    <h2 className={"text-2xl"}>利用可能な形式</h2>
                    <div>
                      <p>ローカルファイル: PDF/画像</p>
                      <p>GoogleDrive: PDF/画像/GoogleSlides</p>
                    </div>
                    <Controls />
                  </Flex>
                </div>
              </>
            ) : (
              <>
                <div className={"flex items-center gap-3 px-3 py-2 shrink-0"}>
                  <div className={"flex items-center gap-3 shrink-0"}>
                    <Logo />
                    <LocalFilePicker />
                    <GooglePicker />
                  </div>
                  <Input
                    className={"flex-1"}
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder={"ファイル名"}
                  />
                  <div className={"flex gap-2 shrink-0"}>
                    <Button
                      icon={<SettingOutlined />}
                      onClick={() => setSettingsOpen(true)}
                    >
                      設定
                    </Button>
                    <Link href={"./convert"} aria-disabled={files.length === 0}>
                      <Button type={"primary"} disabled={files.length === 0}>
                        Next
                      </Button>
                    </Link>
                  </div>
                </div>
                <div
                  className={"flex flex-1 overflow-hidden flex-col md:flex-row"}
                >
                  {/* Left: slide thumbnail sidebar */}
                  <div
                    className={
                      "w-full h-[140px] overflow-x-auto flex flex-row gap-1 p-1 md:w-[200px] md:h-full md:overflow-y-auto md:overflow-x-hidden md:flex-col"
                    }
                  >
                    <SlideSidePanel
                      files={files}
                      selectedIndex={selectedIndex}
                      onSelect={onSelect}
                      onDelete={handleDelete}
                    />
                  </div>

                  {/* Center: main preview + notes */}
                  <div className={"flex-1 overflow-y-auto p-4 min-w-0"}>
                    <MainPreviewArea
                      file={files[selectedIndex]}
                      onNoteChange={handleNoteChange}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <Modal
        title={"設定"}
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        footer={
          <Button type={"primary"} onClick={() => setSettingsOpen(false)}>
            OK
          </Button>
        }
      >
        <SettingsPanel />
      </Modal>
    </>
  );
};
