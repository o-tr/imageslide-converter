"use client";
import Link from "@/compat/link";
import { PageContent } from "@/components/PageContent";
import { Result } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";

export default function Page() {
  return (
    <PageContent className={"flex-1 grid place-items-center"}>
      <Result
        status="404"
        title="404"
        subTitle="ページは見つかりませんでした"
        extra={
          <Link href={"/"} className={buttonVariants()}>
            Back Home
          </Link>
        }
      />
    </PageContent>
  );
}
