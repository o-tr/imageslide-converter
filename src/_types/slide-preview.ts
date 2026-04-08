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
