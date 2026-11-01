import type { FC } from "react";
import { GooglePicker } from "./GooglePicker";
import { LocalFilePicker } from "./LocalFilePicker";

export const Controls: FC = () => {
  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
      <LocalFilePicker variant="card" />
      <GooglePicker variant="card" />
    </div>
  );
};
