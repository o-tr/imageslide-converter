import { UploadSteps } from "@/app/(_)/convert/_components/UploadSteps";
import { Flex, Spin } from "antd";
import { Convert } from "./_components/convert";

export default function Page() {
  return (
    <>
      <UploadSteps current={2} />
      <div className={"flex-1 grid place-items-center"}>
        <Flex gap={16} align={"center"}>
          <Spin size={"large"} />
          <h2 className={"text-xl"}>ファイルを変換しています...</h2>
        </Flex>
      </div>
      <Convert />
    </>
  );
}
