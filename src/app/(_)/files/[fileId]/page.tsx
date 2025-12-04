import { Reset } from "@/app/(_)/files/[fileId]/_components/Reset";
import { URLDisplay } from "@/app/(_)/files/[fileId]/_components/URLDisplay";
import { Flex } from "antd";

type Props = Readonly<{ params: Promise<{ fileId: string }> }>;

export default async function Page({ params }: Props) {
  const { fileId } = await params;
  return (
    <div className={"flex-1 grid place-items-center"}>
      <Flex vertical gap={"middle"} className={"w-3/4"}>
        <URLDisplay fileId={fileId} />
      </Flex>
      <Reset />
    </div>
  );
}
