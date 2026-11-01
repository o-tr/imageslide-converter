"use client";
import { signOut, useSession } from "@/compat/auth-client";
import Image from "@/compat/image";
import Link from "@/compat/link";
import { Button, Dropdown, type MenuProps } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";

export const ManageUser = () => {
  const { data: session, status } = useSession();

  const items: MenuProps["items"] = [
    {
      key: "1",
      label: <span>Sign out</span>,
      onClick: () => {
        void signOut();
      },
    },
  ];

  if (status !== "authenticated" || !session?.user) return null;
  return (
    <>
      <Link
        href={"/convert/pick"}
        className={buttonVariants({ variant: "outline" })}
      >
        Upload
      </Link>
      <Link
        href={"/my/files"}
        className={buttonVariants({ variant: "outline" })}
      >
        Files
      </Link>
      <Dropdown menu={{ items }} placement="bottomRight">
        <Button
          className={"!p-[3px] !pr-[7px]"}
          icon={
            <Image
              src={session.user.image ?? ""}
              alt={"icon"}
              width={24}
              height={24}
              className={"rounded-[2px]"}
            />
          }
        >
          {session.user.name}
        </Button>
      </Dropdown>
    </>
  );
};
