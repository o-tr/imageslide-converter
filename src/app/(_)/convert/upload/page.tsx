import { UploadSteps } from "@/app/(_)/convert/_components/UploadSteps";
import { Upload } from "@/app/(_)/convert/upload/_components/Upload";

export default function Page() {
  return (
    <>
      <UploadSteps current={2} />
      <Upload />
    </>
  );
}
