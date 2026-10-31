import Layout from "@/app/(auth-popup)/layout";
import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_popup")({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});
