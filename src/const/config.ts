export const GIF_SIZE_CAP = 20 * 1024 * 1024; // 20 MB — shared by the proxy and client GIF reader

export const IMAGE_DIFF_THRESHOLD = 10;
export const IMAGE_BOUNDING_BOX_PENALTY_FACTOR = 0.1;
export const IMAGE_BOUNDING_BOX_LIMIT = 8;

/**
 * Maximum per-channel change the converter may apply to slide pixels so that
 * LZ4 finds longer runs. 0 disables it; 2 is below visible thresholds.
 */
export const IMAGE_NEAR_LOSSLESS_TOLERANCE = 2;
/** Dependency forest limits for slide deltas (see planParents). */
export const SLIDE_PARENT_MAX_DEPTH = 6;
export const SLIDE_PARENT_DEPTH_PENALTY = 1500;
