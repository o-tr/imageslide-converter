"use client";
import type { SelectedFile } from "@/_types/file-picker";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { threads } from "@/lib/worker/threads";
import { HolderOutlined } from "@ant-design/icons";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button, Flex, Table, type TableColumnsType } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useAtom, useSetAtom } from "jotai";
import Link from "next/link";
import {
  type CSSProperties,
  type ChangeEvent,
  type FC,
  type HTMLAttributes,
  createContext,
  useContext,
  useMemo,
} from "react";
import { MdDeleteOutline } from "react-icons/md";
import { Controls } from "./Controls";
import { Preview } from "./Preview";

interface RowContextProps {
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  listeners?: SyntheticListenerMap;
}

const RowContext = createContext<RowContextProps>({});

const DragHandle: FC = () => {
  const { setActivatorNodeRef, listeners } = useContext(RowContext);
  return (
    <div
      ref={setActivatorNodeRef}
      className={
        "absolute left-0 top-0 w-full h-full grid place-items-center cursor-move"
      }
      {...listeners}
    >
      <Button type="text" size="small" icon={<HolderOutlined />} />
    </div>
  );
};

const Actions: FC<{ value: SelectedFile }> = ({ value }) => {
  const setFiles = useSetAtom(SelectedFilesAtom);

  const onDelete = () => {
    setFiles((prevState) => prevState.filter((item) => item.id !== value.id));
  };

  return <Button type="text" icon={<MdDeleteOutline />} onClick={onDelete} />;
};

const NoteEditor: FC<{ value: SelectedFile }> = ({ value }) => {
  const setFiles = useSetAtom(SelectedFilesAtom);

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setFiles((prevState) =>
      prevState.map((item) => {
        if (item.id === value.id) {
          return { ...item, note: e.target.value };
        }
        return item;
      }),
    );
  };

  return <TextArea value={value.note} onChange={onChange} />;
};

const columns: TableColumnsType<SelectedFile> = [
  { key: "sort", align: "center", width: 80, render: () => <DragHandle /> },
  {
    title: "Image",
    width: 160,
    render: (data) => <Preview canvas={data.canvas} />,
  },
  { title: "File name", key: "fileName", render: (data) => data.fileName },
  { title: "Speaker Note", render: (data) => <NoteEditor value={data} /> },
  { title: "Actions", width: 80, render: (value) => <Actions value={value} /> },
];

export const FileList = () => {
  const [files, setFiles] = useAtom(SelectedFilesAtom);

  console.log(threads);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id !== over?.id) {
      setFiles((prevState) => {
        const activeIndex = prevState.findIndex(
          (record) => record.id === active?.id,
        );
        const overIndex = prevState.findIndex(
          (record) => record.id === over?.id,
        );
        return arrayMove(prevState, activeIndex, overIndex);
      });
    }
  };

  if (files.length === 0)
    return (
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
    );

  return (
    <Flex gap={"middle"} vertical className={"flex-1 overflow-hidden"}>
      <Flex justify={"space-between"}>
        <Controls />
        <Link href={"./options"}>
          <Button type={"primary"}>Next</Button>
        </Link>
      </Flex>
      <div className={"flex-1 overflow-hidden"}>
        <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext
            items={files.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table
              rowKey="id"
              components={{ body: { row: Row } }}
              columns={columns}
              dataSource={files}
              className={"w-full flex-1 overflow-y-scroll h-full"}
              pagination={false}
            />
          </SortableContext>
        </DndContext>
      </div>
    </Flex>
  );
};

interface RowProps extends HTMLAttributes<HTMLTableRowElement> {
  "data-row-key": string;
}

const Row: FC<RowProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props["data-row-key"] });

  const style: CSSProperties = {
    ...props.style,
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };

  const contextValue = useMemo<RowContextProps>(
    () => ({ setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners],
  );

  return (
    <RowContext.Provider value={contextValue}>
      <tr {...props} ref={setNodeRef} style={style} {...attributes} />
    </RowContext.Provider>
  );
};
