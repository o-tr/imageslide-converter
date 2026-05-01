export type SlideAnimation = {
  x: number;
  y: number;
  w: number;
  h: number;
  fps: number;
  frames: ImageData[];
};

export type SlideFrame = {
  index: number;
  width: number;
  height: number;
  imageData: ImageData;
  animations?: SlideAnimation[];
};

export type SlideFrameMeta = {
  index: number;
  width: number;
  height: number;
  hasAnimations?: boolean;
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
