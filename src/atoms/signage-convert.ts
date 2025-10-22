import type { EIASignageManifest } from "@/_types/eia/v1";
import type { SelectedFile } from "@/_types/file-picker";
import type { TTextureConverterFormat } from "@/_types/text-zip/formats";
import { atom } from "jotai";

export const SignageConvertAtom = atom<
  | {
      signage: EIASignageManifest;
      files: SelectedFile[];
      format: TTextureConverterFormat;
    }
  | undefined
>();
