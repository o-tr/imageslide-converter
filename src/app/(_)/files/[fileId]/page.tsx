import { Reset } from "@/app/(_)/files/[fileId]/_components/Reset";
import { URLDisplay } from "@/app/(_)/files/[fileId]/_components/URLDisplay";
import { Flex } from "@/components/primitives";

type Props = Readonly<{ params: { fileId: string } }>;

export default function Page({ params }: Props) {
  const { fileId } = params;
  return (
    <div className={"flex-1 grid place-items-center"}>
      <Flex vertical gap={"middle"} className={"w-3/4 overflow-hidden"}>
        <URLDisplay fileId={fileId} />
      </Flex>
      <Reset />
    </div>
  );
}
