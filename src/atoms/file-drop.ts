import type { SelectedFile } from "@/_types/file-picker";
import { atom } from "jotai";

export const IsDragOverAtom = atom<boolean>(false);

export const SelectedFilesAtom = atom<SelectedFile[]>([]);

export const OutputFileNameAtom = atom<string>("");
