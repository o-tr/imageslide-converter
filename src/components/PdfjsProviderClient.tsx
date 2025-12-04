"use client";
import dynamic from "next/dynamic";

export const PdfjsProvider = dynamic(
  () => import("@/components/PdfjsProvider").then((v) => v.PdfjsProvider),
  { ssr: false },
);
