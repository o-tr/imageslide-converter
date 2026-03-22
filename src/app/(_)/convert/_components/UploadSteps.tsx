import { type StepProps, Steps } from "antd";
import type { ComponentProps, FC } from "react";

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
