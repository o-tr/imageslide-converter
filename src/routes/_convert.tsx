import Layout from "@/app/(_convert)/layout";
import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_convert")({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});
