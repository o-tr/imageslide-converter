import { DragWatcher } from "@/components/DragWatcher";
import { FileList } from "./_components/FileList";

export default function Page() {
  return (
    <>
      <FileList />
      <DragWatcher />
    </>
  );
}
