import type { SelectedFile } from "@/_types/file-picker";

export type TransitionType =
  | "None"
  | "SlideUp"
  | "SlideDown"
  | "SlideLeft"
  | "SlideRight"
  | "FadeIn";

export interface SlideConfig {
  id: string;
  file: SelectedFile | null;
  duration: number;
  transition: TransitionType;
}

export interface SignboardConfig {
  signboards: {
    id: string;
    name: string;
  }[];
  rows: {
    id: string;
    rowIndex: number;
    images: SlideConfig[];
  }[];
}
