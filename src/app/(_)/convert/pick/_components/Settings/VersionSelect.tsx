"use client";
import { UsingVersionAtom } from "@/atoms/convert";
import { TargetVersions } from "@/const/convert";
import { Flex, Select } from "antd";
import { useAtom } from "jotai";
import type { FC } from "react";

const options = [
  ...TargetVersions.map((v) => ({
    value: v.label,
    label: v.label,
  })),
  { value: "all", label: "すべて表示" },
];

export const VersionSelect: FC = () => {
  const [version, setVersion] = useAtom(UsingVersionAtom);
  return (
    <Flex vertical gap={4}>
      <span className="text-sm font-medium">バージョン</span>
      <Select
        value={version}
        onChange={setVersion}
        options={options}
        className="w-full"
      />
    </Flex>
  );
};
