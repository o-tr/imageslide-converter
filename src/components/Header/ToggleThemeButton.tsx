"use client";
import { Button, Dropdown } from "antd";
import { useTheme } from "next-themes";
import type { FC } from "react";
import { MdOutlineNightlight, MdOutlineWbSunny } from "react-icons/md";

export const ToggleThemeButton: FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        selectable: true,
        selectedKeys: [theme ?? "system"],
        onClick: ({ key }) => setTheme(key),
        items: [
          { key: "system", label: "システム設定に従う" },
          { key: "light", label: "ライト" },
          { key: "dark", label: "ダーク" },
        ],
      }}
    >
      <Button aria-label="テーマを選択">
        {resolvedTheme === "dark" ? (
          <MdOutlineNightlight />
        ) : (
          <MdOutlineWbSunny />
        )}
      </Button>
    </Dropdown>
  );
};
