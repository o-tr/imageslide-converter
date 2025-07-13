import { img2selectedFiles } from "@/lib/file2selectedFiles/img2selectedFiles";
import { useState } from "react";
import { DEFAULT_SLIDE_DURATION } from "../constants";
import type { SignboardConfig, TransitionType } from "./types";
import { createSignboardImage, createUniqueId } from "./utils";

export const useSignboardConfig = () => {
  const [config, setConfig] = useState<SignboardConfig>({
    signboards: [{ name: "看板1", id: createUniqueId() }],
    rows: [
      {
        id: createUniqueId(),
        rowIndex: 0,
        duration: DEFAULT_SLIDE_DURATION,
        images: [createSignboardImage()],
      },
    ],
  });

  const slideCount = config.rows.length;
  const durations = config.rows.map((row) => row.duration);

  // 看板操作
  const addSignboard = () => {
    setConfig((prev) => ({
      ...prev,
      signboards: [
        ...prev.signboards,
        { id: createUniqueId(), name: `看板${prev.signboards.length + 1}` },
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
  const addSlide = (atIdx?: number) => {
    setConfig((prev) => {
      const insertIdx = atIdx !== undefined ? atIdx : prev.rows.length;
      const newRow = {
        id: createUniqueId(),
        rowIndex: insertIdx,
        duration: DEFAULT_SLIDE_DURATION,
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

  const removeSlide = (idx: number) => {
    if (slideCount === 1) return;
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows
        .filter((_, i) => i !== idx)
        .map((row, i) => ({ ...row, rowIndex: i })),
    }));
  };

  const handleDurationChange = (idx: number, value: number) => {
    setConfig((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === idx ? { ...row, duration: value } : row,
      ),
    }));
  };

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

  // DnD操作
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

      if (!fromFile) return prev;
      if (fromCol === toCol && fromRow === toRow) return prev;

      const toFile = newRows[toRow].images[toCol];
      newRows[fromRow].images[fromCol] = toFile;
      newRows[toRow].images[toCol] = fromFile;
      return { ...prev, rows: newRows };
    });
  };

  return {
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
  };
};
