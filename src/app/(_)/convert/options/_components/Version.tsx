"use client";
import { UsingVersionAtom } from "@/atoms/convert";
import { TargetVersions } from "@/const/convert";
import { Flex, Radio } from "antd";
import { useAtom } from "jotai";
import Image from "next/image";
import type { FC } from "react";

export const Version: FC = () => {
  const [version, setVersion] = useAtom(UsingVersionAtom);
  return (
    <Flex vertical gap={"middle"}>
      <h2 className={"text-xl"}>使用している環境を選択してください</h2>
      <Radio.Group onChange={(e) => setVersion(e.target.value)} value={version} className="!flex flex-wrap flex-row">
        {TargetVersions.map((v) => (
          <Radio.Button
            key={v.label}
            value={v.label}
            className={"w-[256px] !h-[256px]"}
          >
            <Flex vertical className={"p-2 text-center"}>
              <Image
                src={v.image}
                alt={v.label}
                width={224}
                height={224}
                className={"object-contain"}
              />
              <p>{v.label}</p>
            </Flex>
          </Radio.Button>
        ))}
          <Radio.Button
            value={"all"}
            className={"w-[256px] !h-[256px]"}
          >
            <Flex vertical className={"p-2 text-center"}>
              <p>すべて表示</p>
            </Flex>
          </Radio.Button>
      </Radio.Group>
    </Flex>
  );
};
