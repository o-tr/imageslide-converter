"use client";
import { useSession } from "@/compat/auth-client";
import { ManageUser } from "@/components/Header/UserControl/ManageUser";
import { SignIn } from "@/components/Header/UserControl/SignIn";
import { Button } from "@/components/primitives";

export const UserControl = () => {
  const { data: session, status } = useSession();
  if (status === "loading") return <Button loading>Loading...</Button>;
  if (session) return <ManageUser />;
  return <SignIn />;
};
