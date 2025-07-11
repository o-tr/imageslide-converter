import React from "react";
import { SignboardConfig } from "./types";

interface SlideRowProps {
  idx: number;
  durations: number[];
  signboards: SignboardConfig[];
  handleDurationChange: (idx: number, value: string) => void;
  handleImageChange: (signboardIdx: number, idx: number, file: File | null) => void;
  removeSlide: (idx: number) => void;
  slideCount: number;
  getImagePreview: (file: File | null) => string | undefined;
}

const SlideRow: React.FC<SlideRowProps> = ({
  idx,
  durations,
  signboards,
  handleDurationChange,
  handleImageChange,
  removeSlide,
  slideCount,
  getImagePreview,
}) => {
  return (
    <>
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2 border-b dark:border-gray-700 text-center font-bold">{idx + 1}</td>
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2 border-b dark:border-gray-700">
        <input
          type="number"
          min={1}
          value={durations[idx]}
          onChange={(e) => handleDurationChange(idx, e.target.value)}
          className="border rounded px-2 py-1 w-16 dark:bg-gray-900 dark:text-white dark:border-gray-600"
        />
      </td>
      {signboards.map((sb, sbIdx) => (
        <td key={sbIdx} className="bg-white dark:bg-gray-900 px-2 py-2 border-b dark:border-gray-700">
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(sbIdx, idx, e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              className="dark:text-gray-200"
            />
            {sb.slides[idx]?.image && (
              <img
                src={getImagePreview(sb.slides[idx].image)}
                alt="preview"
                className="w-24 h-16 object-cover border dark:border-gray-600"
              />
            )}
          </div>
        </td>
      ))}
      <td className="bg-gray-100 dark:bg-gray-800 px-2 py-2 border-b dark:border-gray-700 align-middle">
        <button
          onClick={() => removeSlide(idx)}
          disabled={slideCount === 1}
          className="px-2 py-1 border rounded text-red-600 disabled:opacity-50 dark:bg-gray-700 dark:text-red-400 dark:border-gray-600"
        >一括削除</button>
      </td>
    </>
  );
};

export default SlideRow;
