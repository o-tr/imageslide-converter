import { DndImageFilePicker } from "@/components/DndImageFilePicker";
import type React from "react";
import { Preview } from "../convert/pick/_components/FileList/Preview";
import type { SignboardConfig } from "./types";

interface SlideRowProps {
  idx: number;
  durations: number[];
  signboards: SignboardConfig[];
  handleDurationChange: (idx: number, value: string) => void;
  handleImageChange: (
    signboardIdx: number,
    idx: number,
    file: File | null,
  ) => void;
  removeSlide: (idx: number) => void;
  slideCount: number;
  getImagePreview: (file: File | null) => string | undefined;
  dndHandle?: React.ReactNode;
}

const SlideRow: React.FC<SlideRowProps> = ({
  idx,
  durations,
  signboards,
  handleDurationChange,
  handleImageChange,
  removeSlide,
  slideCount,
  dndHandle,
}) => {
  return (
    <>
      {dndHandle}
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2 text-center font-bold">
        {idx + 1}
      </td>
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2">
        <input
          type="number"
          min={1}
          value={durations[idx]}
          onChange={(e) => handleDurationChange(idx, e.target.value)}
          className="rounded px-2 py-1 w-16 dark:bg-gray-900 dark:text-white"
        />
      </td>
      {signboards.map((sb, sbIdx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
        <td key={sbIdx} className="bg-white dark:bg-gray-900">
          <DndImageFilePicker
            onSelect={(file) => handleImageChange(sbIdx, idx, file)}
            accept="image/*"
            showPreview
            selectedFile={sb.slides[idx]?.file || undefined}
          />
        </td>
      ))}
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2 align-middle">
        <button
          type="button"
          onClick={() => removeSlide(idx)}
          disabled={slideCount === 1}
          className="px-2 py-1 rounded text-red-600 disabled:opacity-50 dark:bg-gray-700 dark:text-red-400"
        >
          削除
        </button>
      </td>
    </>
  );
};

export default SlideRow;
