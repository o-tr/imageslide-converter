"use client";
import { UploadSteps } from "@/app/(_)/convert/_components/UploadSteps";
import { Format } from "@/app/(_)/convert/options/_components/Format";
import { Resolution } from "@/app/(_)/convert/options/_components/Resolution";
import { UsingVersionAtom } from "@/atoms/convert";
import { SelectedFilesAtom } from "@/atoms/file-drop";
import { Button, Flex } from "antd";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect } from "react";
import { Version } from "./_components/Version";

export default function Page() {
  const version = useAtomValue(UsingVersionAtom);
  const files = useAtomValue(SelectedFilesAtom);

  useEffect(() => {
    if (!files.length) {
      redirect("./pick");
    }
  }, [files]);

  return (
    <>
      <UploadSteps current={1} />
      <Flex justify={"space-between"}>
        <Link href={"./pick"}>
          <Button>Prev</Button>
        </Link>
        {version !== "" ? (
          <Link href={"./convert"}>
            <Button type={"primary"}>Next</Button>
          </Link>
        ) : (
          <Button type={"primary"} disabled>
            Next
          </Button>
        )}
      </Flex>
      <Version />
      {!!version && <Resolution />}
      {!!version && <Format />}
    </>
  );
}
