import React from "react";
import { SignboardConfig, TransitionType } from "./types";

interface TransitionRowProps {
  idx: number;
  signboards: SignboardConfig[];
  handleTransitionChangeBetween: (sbIdx: number, idx: number, value: TransitionType) => void;
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
      <td colSpan={3} className="bg-yellow-50 dark:bg-yellow-900 px-2 py-2 border-b dark:border-gray-700 text-center text-xs font-semibold">
        <span className="text-yellow-700 dark:text-yellow-200">
          ↓ {idx + 1}枚目と{idx + 2}枚目の間のトランジション
        </span>
      </td>
      {signboards.map((sb, sbIdx) => (
        <td key={sbIdx} className="bg-yellow-50 dark:bg-yellow-900 px-2 py-2 border-b dark:border-gray-700 text-center">
          <select
            value={sb.transitions[idx] || "None"}
            onChange={(e) => handleTransitionChangeBetween(sbIdx, idx, e.target.value as TransitionType)}
            className="border rounded px-2 py-1 dark:bg-gray-900 dark:text-white dark:border-gray-600"
          >
            {transitionTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </td>
      ))}
      <td></td>
    </tr>
  );
};

export default TransitionRow;
