import Image from "@/compat/image";
import Link from "@/compat/link";
import { Flex } from "@/components/primitives";
import type { FC } from "react";

export const HeaderLogo: FC = () => {
  return (
    <div className={"p-6"}>
      <Link
        href={"/"}
        className="inline-flex h-12 items-center rounded-md px-4 hover:bg-accent"
      >
        <Flex gap={16} align={"center"} className={"h-[32px]"}>
          <Image src={"/icon.png"} alt={"logo"} width={32} height={32} />
          <span className={"text-2xl hidden sm:block"}>
            ImageSlide Converter
          </span>
        </Flex>
      </Link>
    </div>
  );
};
