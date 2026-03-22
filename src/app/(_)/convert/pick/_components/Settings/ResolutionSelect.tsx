"use client";
import { TargetResolutionAtom } from "@/atoms/convert";
import { RESOLUTION_DIMENSIONS, type Resolution } from "@/const/resolutions";
import { Flex, Select } from "antd";
import { useAtom } from "jotai";
import type { FC } from "react";

const options = Object.entries(RESOLUTION_DIMENSIONS).map(([key, value]) => ({
  value: key as Resolution,
  label: `${value.label} - ${value.description}${key === "FHD" ? " (推奨)" : ""}`,
}));

export const ResolutionSelect: FC = () => {
  const [resolution, setResolution] = useAtom(TargetResolutionAtom);
  return (
    <Flex vertical gap={4}>
      <span className="text-sm font-medium">解像度</span>
      <Select
        value={resolution}
        onChange={setResolution}
        options={options}
        className="w-full"
      />
    </Flex>
  );
};
