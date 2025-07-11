export type TransitionType = "None" | "SlideUp" | "SlideDown" | "SlideLeft" | "SlideRight" | "FadeIn";

export interface SlideConfig {
  image: File | null;
  duration: number;
  transition: TransitionType;
}

export interface SignboardConfig {
  name: string;
  slides: SlideConfig[];
  transitions: TransitionType[];
}
