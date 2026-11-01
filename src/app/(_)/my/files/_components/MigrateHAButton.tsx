import { Button, Modal, Tooltip } from "@/components/primitives";
import { type FC, useState } from "react";
import { BiSolidCloudUpload } from "react-icons/bi";

type Props = {
  onClick: () => void;
};

export const MigrateHAButton: FC<Props> = ({ onClick }) => {
  const [confirming, setConfirming] = useState<boolean>(false);
  return (
    <>
      <Tooltip placement={"top"} title={"高可用性サーバへ移行"}>
        <Button
          icon={<BiSolidCloudUpload />}
          onClick={() => setConfirming(true)}
        />
      </Tooltip>
      <Modal
        title={"ファイルを高可用性サーバーに移行しますか?"}
        open={confirming}
        onCancel={() => setConfirming(false)}
        onOk={() => {
          setConfirming(false);
          onClick();
        }}
      >
        <p>ファイルを移行すると通常サーバーからはファイルが削除されます</p>
        <p>新たにURLが発行されるため以前のURLではアクセスできなくなります</p>
        <p>高可用性サーバーのファイル保持期間は移行から7日間です</p>
      </Modal>
    </>
  );
};
