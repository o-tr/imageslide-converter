import {
  UPLOAD_STEP,
  UploadSteps,
} from "@/app/(_)/convert/_components/UploadSteps";
import { DragWatcher } from "@/components/DragWatcher";
import { FileList } from "./_components/FileList";

export default function Page() {
  return (
    <>
      <UploadSteps current={UPLOAD_STEP.PICK_FILE} />
      <FileList />
      <DragWatcher />
    </>
  );
}
