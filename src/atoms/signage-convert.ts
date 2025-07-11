import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import { atom } from "jotai";

export const SignageConvertAtom = atom<
  | {
      signage: EIASignageManifest;
      files: SelectedFile[];
    }
  | undefined
>();
