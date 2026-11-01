import Page from "@/app/(_)/files/[fileId]/page";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_main/files/$fileId")({
  component: FilePage,
});
function FilePage() {
  const { fileId } = Route.useParams();
  return <Page params={{ fileId }} />;
}
