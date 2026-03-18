"use client";
import type { FileItem } from "@/_types/api/getMyFiles";
import type { PatchRequest } from "@/app/api/my/files/[fileId]/route";
import { deleteRegisteredFile } from "@/lib/service/deleteRegisteredFile";
import { getMyFiles } from "@/lib/service/getMyFiles";
import { patchMyFile } from "@/lib/service/patchMyFile";
import { postMigrateHA } from "@/lib/service/postMigrateHA";
import {
  Flex,
  Modal,
  Spin,
  type SpinProps,
  Table,
  type TableColumnsType,
} from "antd";
import type { SorterResult } from "antd/es/table/interface";
import { signIn } from "next-auth/react";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { Actions } from "./Actions";
import { MigrateHAButton } from "./MigrateHAButton";

type SortState = { key: string; order: "ascend" | "descend" };

export const FileList: FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean | SpinProps>(true);
  const [migrateProgress, setMigrateProgress] = useState<number>(-1);
  const [sortStates, setSortStates] = useState<SortState[]>([]);

  const loadFiles = useCallback(async () => {
    const files = await getMyFiles();
    setFiles(files);
    setMigrateProgress(-1);
    setLoading(false);
  }, []);

  const deleteFile = useMemo(
    () => async (fileId: string) => {
      setLoading(true);
      await deleteRegisteredFile(fileId);
      await loadFiles();
    },
    [loadFiles],
  );

  const updateFile = useMemo(
    () => async (fileId: string, data: PatchRequest) => {
      setLoading(true);
      await patchMyFile(fileId, data);
      await loadFiles();
    },
    [loadFiles],
  );

  useEffect(() => {
    void loadFiles().catch((_e) => {
      void signIn("discord", { callbackUrl: "/my/files" });
    });
  }, [loadFiles]);

  const handleTableChange = useCallback(
    (
      _: unknown,
      __: unknown,
      sorter: SorterResult<FileItem> | SorterResult<FileItem>[],
    ) => {
      const sorters = (Array.isArray(sorter) ? sorter : [sorter]).filter(
        (s) => s.order != null,
      );
      setSortStates((prev) => {
        const activeKeys = new Set(sorters.map((s) => s.columnKey as string));
        const kept = prev
          .filter((p) => activeKeys.has(p.key))
          .map((p) => ({
            key: p.key,
            order: sorters.find((s) => s.columnKey === p.key)
              ?.order as SortState["order"],
          }));
        const prevKeys = new Set(prev.map((p) => p.key));
        const added = sorters
          .filter((s) => !prevKeys.has(s.columnKey as string))
          .map((s) => ({
            key: s.columnKey as string,
            order: s.order as SortState["order"],
          }));
        return [...kept, ...added];
      });
    },
    [],
  );

  const sortedFiles = useMemo(() => {
    if (sortStates.length === 0) return files;
    return [...files].sort((a, b) => {
      for (const { key, order } of sortStates) {
        let cmp = 0;
        if (key === "name") cmp = a.name.localeCompare(b.name);
        else if (key === "count") cmp = a.count - b.count;
        else if (key === "format") cmp = a.format.localeCompare(b.format);
        else if (key === "version") cmp = a.version - b.version;
        else if (key === "createdAt")
          cmp =
            new Date(a.createdAt).valueOf() - new Date(b.createdAt).valueOf();
        else if (key === "expireAt") {
          const aVal = a.expireAt
            ? new Date(a.expireAt).valueOf()
            : Number.POSITIVE_INFINITY;
          const bVal = b.expireAt
            ? new Date(b.expireAt).valueOf()
            : Number.POSITIVE_INFINITY;
          cmp = aVal - bVal;
        }
        if (cmp !== 0) return order === "ascend" ? cmp : -cmp;
      }
      return 0;
    });
  }, [files, sortStates]);

  const getSortOrder = useCallback(
    (key: string) => sortStates.find((s) => s.key === key)?.order ?? null,
    [sortStates],
  );

  const getSortMultiple = useCallback(
    (key: string) => {
      const idx = sortStates.findIndex((s) => s.key === key);
      return idx === -1 ? sortStates.length + 1 : idx + 1;
    },
    [sortStates],
  );

  const columns: TableColumnsType<FileItem> = useMemo(
    () => [
      {
        title: "File Name",
        dataIndex: "name",
        key: "name",
        sorter: { multiple: getSortMultiple("name") },
        sortOrder: getSortOrder("name"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "URLs",
        dataIndex: "count",
        key: "count",
        width: 25,
        sorter: { multiple: getSortMultiple("count") },
        sortOrder: getSortOrder("count"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "Server",
        key: "server",
        width: 25,
        render: (file: FileItem) => (
          <Flex gap={"middle"} align={"center"}>
            <span>{file.server}</span>
            {file.server === "Normal" && (
              <MigrateHAButton
                onClick={async () => {
                  setLoading(true);
                  await postMigrateHA(file.fileId, (progress) => {
                    setLoading(true);
                    setMigrateProgress(progress);
                  });
                  await loadFiles();
                }}
              />
            )}
          </Flex>
        ),
      },
      {
        title: "Format",
        dataIndex: "format",
        key: "format",
        width: 100,
        sorter: { multiple: getSortMultiple("format") },
        sortOrder: getSortOrder("format"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "Version",
        dataIndex: "version",
        key: "version",
        width: 100,
        sorter: { multiple: getSortMultiple("version") },
        sortOrder: getSortOrder("version"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "Created At",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 200,
        sorter: { multiple: getSortMultiple("createdAt") },
        sortOrder: getSortOrder("createdAt"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "Expire At",
        dataIndex: "expireAt",
        key: "expireAt",
        width: 200,
        sorter: { multiple: getSortMultiple("expireAt") },
        sortOrder: getSortOrder("expireAt"),
        sortDirections: ["ascend", "descend"],
      },
      {
        title: "Actions",
        key: "actions",
        width: 175,
        render: (file) => (
          <Actions
            file={file}
            deleteFile={deleteFile}
            updateFile={updateFile}
          />
        ),
      },
    ],
    [deleteFile, updateFile, loadFiles, getSortOrder, getSortMultiple],
  );

  return (
    <div>
      <Table
        loading={loading}
        dataSource={sortedFiles}
        rowKey="fileId"
        columns={columns}
        pagination={false}
        onChange={handleTableChange}
      />
      <Modal
        open={loading === true && migrateProgress >= 0}
        title={"Migrating"}
        footer={null}
        closable={false}
      >
        <Flex gap={"middle"}>
          <Spin percent={migrateProgress * 100} />
          <div>{Math.floor(migrateProgress * 100)}%</div>
        </Flex>
      </Modal>
    </div>
  );
};
