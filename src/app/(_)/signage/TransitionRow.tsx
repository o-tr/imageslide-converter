import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type React from "react";
import type { SignboardConfig, TransitionType } from "./types";

interface TransitionRowProps {
  idx: number;
  signboards: SignboardConfig;
  handleTransitionChangeBetween: (
    sbIdx: number,
    idx: number,
    value: TransitionType,
  ) => void;
  transitionTypes: { label: string; value: TransitionType }[];
}

const TransitionRow: React.FC<TransitionRowProps> = ({
  idx,
  signboards,
  handleTransitionChangeBetween,
  transitionTypes,
}) => {
  return (
    <tr className="align-middle" key={`transition-row-${idx}`}>
      <td colSpan={2} className="px-2 py-2 text-center text-xs font-semibold" />
      {signboards.signboards.map((sb, sbIdx) => {
        const value = signboards.rows[idx]?.images[sbIdx]?.transition || "None";
        const label =
          transitionTypes.find((t) => t.value === value)?.label || "None";
        return (
          <td key={sb.id} className="text-center">
            <div className="flex justify-center items-center py-2">
              <Select
                value={value}
                onValueChange={(value) =>
                  handleTransitionChangeBetween(
                    sbIdx,
                    idx,
                    value as TransitionType,
                  )
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={label} />
                </SelectTrigger>
                <SelectContent>
                  {transitionTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </td>
        );
      })}
      <td />
    </tr>
  );
};

export default TransitionRow;
