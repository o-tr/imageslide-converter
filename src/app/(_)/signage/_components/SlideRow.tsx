import { NumericInput } from "@/components/NumericInput";
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import type React from "react";
import { DraggableImageCell } from "./DraggableImageCell";
import type { SignboardConfig } from "./types";

interface SlideRowProps {
  idx: number;
  durations: number[];
  signboards: SignboardConfig;
  handleDurationChange: (idx: number, value: number) => void;
  handleImageChange: (
    signboardIdx: number,
    idx: number,
    file: File | null,
  ) => void;
  removeSlide: (idx: number) => void;
  slideCount: number;
}

const SlideRow: React.FC<SlideRowProps> = ({
  idx,
  durations,
  signboards,
  handleDurationChange,
  handleImageChange,
  removeSlide,
  slideCount,
}) => {
  return (
    <tr>
      <td className="px-2 py-2 text-center font-bold">{idx + 1}</td>
      <td className="px-2 py-2">
        <NumericInput
          type="integer"
          min={1}
          value={durations[idx]}
          onChange={(e) => handleDurationChange(idx, e)}
        />
      </td>

      {signboards.signboards.map((_sb, sbIdx) => {
        const image = signboards.rows[idx]?.images[sbIdx];
        if (!image) {
          return null;
        }
        return (
          <DraggableImageCell
            key={image.id}
            rowIdx={idx}
            colIdx={sbIdx}
            slide={image}
            onSelect={(file) => handleImageChange(sbIdx, idx, file)}
          />
        );
      })}
      <td className="px-2 py-2 align-middle">
        <Button
          type="button"
          onClick={() => removeSlide(idx)}
          disabled={slideCount === 1}
          variant={"destructive"}
          size={"sm"}
        >
          <Trash />
        </Button>
      </td>
    </tr>
  );
};

export default SlideRow;
