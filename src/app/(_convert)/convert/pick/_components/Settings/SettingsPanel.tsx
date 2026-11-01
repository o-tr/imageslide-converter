"use client";
import { Flex } from "@/components/primitives";
import type { FC } from "react";
import { ResolutionSelect } from "./ResolutionSelect";

export const SettingsPanel: FC = () => {
  return (
    <Flex vertical gap={16}>
      <ResolutionSelect />
    </Flex>
  );
};
