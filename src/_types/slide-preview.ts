export type SlideAnimation = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  frames: ImageData[];
};

/** EIA frame dependency info (slide-level crop chain and animation refs). */
export type FrameDependency = {
  kind: "master" | "cropped";
  /** Base frame index (cropped only). Raw EIA index in decoders, display index after decodeSlides. */
  baseIndex?: number;
  rectCount?: number;
  /** Diff rectangles (cropped only), in slide pixel coordinates. */
  rects?: { x: number; y: number; w: number; h: number }[];
  animations?: {
    id: string;
    fps: number;
    frameCount: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
};

export type SlideFrame = {
  index: number;
  width: number;
  height: number;
  imageData: ImageData;
  animations?: SlideAnimation[];
  dependency?: FrameDependency;
};

export type SlideFrameMeta = {
  index: number;
  width: number;
  height: number;
  hasAnimations?: boolean;
  dependency?: FrameDependency;
};

export type AnimationFrame = {
  frameIndex: number;
  duration: number; // ms
};

export type AnimationSequence = AnimationFrame[];

export type RawSignageItem = {
  frameName: string; // EIA frame name (e.g. "5"), used for cross-part global resolution
  duration: number; // ms
};

export type DecodeResult = {
  frames: SlideFrame[];
  animation: AnimationSequence | null;
  rawSignageItems?: RawSignageItem[]; // present for EIA files; used by decodeSlides for global ordering
};
