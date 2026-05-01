import { type StepProps, Steps } from "antd";
import type { ComponentProps, FC } from "react";

export const UPLOAD_STEP = {
  PICK_FILE: 0,
  CONVERT: 1,
  UPLOAD: 2,
  COPY_URL: 3, // URL表示は /files/[fileId] で行われ UploadSteps を使用しないため未参照
} as const;

const items: StepProps[] = [
  {
    title: "ファイルの選択",
  },
  {
    title: "変換",
  },
  {
    title: "アップロード",
  },
  {
    title: "URLをコピー",
  },
];

export const UploadSteps: FC<ComponentProps<typeof Steps>> = (props) => {
  return <Steps direction={"horizontal"} {...props} items={items} />;
};
