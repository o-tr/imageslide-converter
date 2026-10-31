import type { BoundingBox } from "@/_types/lib/crop";
import { mergeTwoBoundingBox } from "@/lib/crop/mergeTwoBoundingBox";

export const mergeOverlapBoundingBox = (
  _boxes: BoundingBox[],
): BoundingBox[] => {
  const boxes = structuredClone(_boxes);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const boxA = boxes[i];
      const boxB = boxes[j];

      if (areOverlap(boxA, boxB)) {
        // 統合されたバウンディングボックスを計算
        boxes[i] = mergeTwoBoundingBox(boxA, boxB);
        boxes.splice(j, 1);
        j--; // インデックスを調整
      }
    }
  }
  return boxes.map((box) => {
    const width = box.x2 - box.x1 + 1;
    const height = box.y2 - box.y1 + 1;
    return {
      ...box,
      width,
      height,
      area: width * height,
    };
  });
};

const areOverlap = (r1: BoundingBox, r2: BoundingBox) => {
  // rect1とrect2はそれぞれ {x, y, x_max, y_max, w, h, area} の形式で与えられると仮定します。

  // 重なりチェック
  const isOverlapping = !(
    r1.x2 < r2.x1 ||
    r2.x2 < r1.x1 ||
    r1.y2 < r2.y1 ||
    r2.y2 < r1.y1
  );
  if (isOverlapping) {
    return true;
  }

  // 包含チェック
  const isContaining =
    (r1.x1 <= r2.x1 && r1.x2 >= r2.x2 && r1.y1 <= r2.y1 && r1.y2 >= r2.y2) ||
    (r2.x1 <= r1.x1 && r2.x2 >= r1.x2 && r2.y1 <= r1.y1 && r2.y2 >= r1.y2);

  if (isContaining) {
    return true;
  }
  // 隣接チェック
  return (
    ((r1.x2 === r2.x1 || r1.x1 === r2.x2) &&
      !(r1.y2 < r2.y1 || r1.y1 > r2.y2)) ||
    ((r1.y2 === r2.y1 || r1.y1 === r2.y2) && !(r1.x2 < r2.x1 || r1.x1 > r2.x2))
  );
};
