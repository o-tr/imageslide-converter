import type { FileItem } from "@/_types/api/getMyFiles";
import { DeleteButton } from "@/app/(_)/my/files/_components/DeleteButton";
import { Button, Flex, Tooltip } from "antd";
import type { FC } from "react";
import { MdOutlineOpenInNew } from "react-icons/md";

export const Actions: FC<{
  file: FileItem;
  deleteFile: (fileId: string) => Promise<void>;
}> = ({ file, deleteFile }) => {
  return (
    <Flex gap={"middle"} wrap={true}>
      <Tooltip placement={"top"} title={"開く"}>
        <Button
          icon={<MdOutlineOpenInNew />}
          target={"_blank"}
          href={`/files/${file.fileId}`}
        />
      </Tooltip>
      <DeleteButton onDelete={() => deleteFile(file.fileId)} />
    </Flex>
  );
};
