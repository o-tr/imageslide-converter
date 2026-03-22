"use client";
import { SettingOutlined } from "@ant-design/icons";
import { Collapse, Flex } from "antd";
import type { FC } from "react";
import { FormatSelect } from "./FormatSelect";
import { ResolutionSelect } from "./ResolutionSelect";
import { VersionSelect } from "./VersionSelect";

export const SettingsPanel: FC = () => {
  return (
    <Collapse
      defaultActiveKey={[]}
      items={[
        {
          key: "settings",
          forceRender: true,
          label: (
            <Flex align="center" gap={8}>
              <SettingOutlined />
              <span>設定</span>
            </Flex>
          ),
          children: (
            <Flex vertical gap={16}>
              <VersionSelect />
              <ResolutionSelect />
              <FormatSelect />
            </Flex>
          ),
        },
      ]}
    />
  );
};
