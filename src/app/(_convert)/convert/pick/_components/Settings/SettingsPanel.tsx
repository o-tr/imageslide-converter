"use client";
import { Flex } from "antd";
import type { FC } from "react";
import { FormatSelect } from "./FormatSelect";
import { ResolutionSelect } from "./ResolutionSelect";
import { VersionSelect } from "./VersionSelect";

export const SettingsPanel: FC = () => {
  return (
    <Flex vertical gap={16}>
      <VersionSelect />
      <ResolutionSelect />
      <FormatSelect />
    </Flex>
  );
};
