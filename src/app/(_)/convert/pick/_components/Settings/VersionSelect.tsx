"use client";
import { UsingVersionAtom, VALID_VERSIONS } from "@/atoms/convert";
import { Flex, Select } from "antd";
import { useAtom } from "jotai";
import type { FC } from "react";

const options = VALID_VERSIONS.map((v) => ({
  value: v,
  label: v === "all" ? "すべて表示" : v,
}));

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
