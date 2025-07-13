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
import { signIn } from "next-auth/react";
import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { Actions } from "./Actions";
import { MigrateHAButton } from "./MigrateHAButton";

export const FileList: FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean | SpinProps>(true);
  const [migrateProgress, setMigrateProgress] = useState<number>(-1);

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

  const columns: TableColumnsType<FileItem> = useMemo(
    () => [
      { title: "File Name", dataIndex: "name", key: "name" },
      { title: "URLs", dataIndex: "count", key: "count", width: 25 },
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
      { title: "Format", dataIndex: "format", key: "format", width: 100 },
      { title: "Version", dataIndex: "version", key: "version", width: 100 },
      {
        title: "Created At",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 200,
      },
      {
        title: "Expire At",
        dataIndex: "expireAt",
        key: "expireAt",
        width: 200,
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
    [deleteFile, updateFile, loadFiles],
  );

  return (
    <div>
      <Table
        loading={loading}
        dataSource={files}
        rowKey="fileId"
        columns={columns}
        pagination={false}
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
