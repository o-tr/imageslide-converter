import {
  UPLOAD_STEP,
  UploadSteps,
} from "@/app/(_)/convert/_components/UploadSteps";
import { Upload } from "@/app/(_)/convert/upload/_components/Upload";

export default function Page() {
  return (
    <>
      <UploadSteps current={UPLOAD_STEP.UPLOAD} />
      <Upload />
    </>
  );
}
