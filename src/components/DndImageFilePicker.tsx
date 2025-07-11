import type { SelectedFile } from "@/_types/file-picker";
import { Preview } from "@/app/(_)/convert/pick/_components/FileList/Preview";
import { type FC, useId, useState } from "react";

type Props = {
  onSelect: (file: File | null) => void;
  accept?: string;
  showPreview?: boolean;
  selectedFile?: SelectedFile;
};

export const DndImageFilePicker: FC<Props> = ({
  onSelect,
  accept,
  showPreview,
  selectedFile,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const id = useId();

  return (
    <label
      htmlFor={id}
      className={`block outline-none ${isDraggingOver ? "ring-2 ring-blue-500" : "ring-1 ring-gray-300"} rounded grid items-center justify-items-center cursor-pointer h-[150px]`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files[0];
        if (!file?.type.startsWith("image/")) {
          return;
        }
        onSelect(file);
      }}
    >
      <input
        type="file"
        accept={accept}
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
        id={id}
        className={selectedFile ? "hidden" : ""}
      />
      {showPreview && selectedFile?.canvas && (
        <Preview canvas={selectedFile.canvas} />
      )}
      {selectedFile && <span>{selectedFile.fileName}</span>}
    </label>
  );
};
