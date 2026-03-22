"use client";
import type { PatchRequest } from "@/app/api/my/files/[fileId]/route";
import { LoadingOutlined } from "@ant-design/icons";
import { Input, message } from "antd";
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
  const cancelledRef = useRef(false);

  const cancelEditing = useCallback(() => {
    setValue(name);
    setEditing(false);
  }, [name]);

  const save = useCallback(async () => {
    if (savingRef.current || cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === name) {
      cancelEditing();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await onUpdate(fileId, { name: trimmed });
      setValue(trimmed);
      setEditing(false);
    } catch {
      void message.error("ファイル名の変更に失敗しました");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [value, name, fileId, onUpdate, cancelEditing]);

  const handleClick = useCallback(() => {
    if (editing) return;
    cancelledRef.current = false;
    setValue(name);
    setEditing(true);
  }, [editing, name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        cancelledRef.current = true;
        cancelEditing();
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.currentTarget.blur();
      }
    },
    [cancelEditing],
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
      readOnly={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={handleKeyDown}
      suffix={
        <LoadingOutlined
          spin={saving}
          style={{ visibility: saving ? "visible" : "hidden" }}
        />
      }
    />
  );
};
