import MainLayout from "@/app/(_)/layout";
import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_main")({
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
