"use client";
import type { PatchRequest } from "@/app/api/my/files/[fileId]/route";
import { LoadingOutlined } from "@ant-design/icons";
import { Input } from "antd";
import { type FC, useCallback, useRef, useState } from "react";

export const EditableFileName: FC<{
  fileId: string;
  name: string;
  onUpdate: (fileId: string, data: PatchRequest) => Promise<void>;
}> = ({ fileId, name, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === name) {
      setValue(name);
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onUpdate(fileId, { name: trimmed });
    } finally {
      savingRef.current = false;
      setSaving(false);
      setEditing(false);
    }
  }, [value, name, fileId, onUpdate]);

  const handleClick = useCallback(() => {
    if (editing) return;
    setValue(name);
    setEditing(true);
  }, [editing, name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setValue(name);
        setEditing(false);
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.currentTarget.blur();
      }
    },
    [name],
  );

  if (!editing) {
    return (
      <button
        type="button"
        className="cursor-pointer border-none bg-transparent p-0 text-left text-inherit"
        onClick={handleClick}
      >
        {name}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={handleKeyDown}
      suffix={saving ? <LoadingOutlined spin /> : <span />}
    />
  );
};
