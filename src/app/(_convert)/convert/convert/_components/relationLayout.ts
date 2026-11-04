export type Point = { x: number; y: number };

/** Place each resolved dependency tree in its own sector, with children near their parent. */
export function relationTargets(
  parents: (number | null)[],
  resolved: boolean[],
  width: number,
  height: number,
): (Point | undefined)[] {
  const count = parents.length;
  const children = Array.from({ length: count }, () => [] as number[]);
  const roots: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!resolved[i]) continue;
    const parent = parents[i];
    if (
      parent !== null &&
      parent >= 0 &&
      parent < count &&
      parent !== i &&
      resolved[parent]
    )
      children[parent].push(i);
    else roots.push(i);
  }
  const targets: (Point | undefined)[] = Array(count);
  const radius = Math.max(60, Math.min(width, height) * 0.4);
  const step = Math.min(55, Math.max(20, radius * 0.2));
  const size = (node: number, seen: Set<number>): number => {
    if (seen.has(node)) return 0;
    seen.add(node);
    return (
      1 + children[node].reduce((sum, child) => sum + size(child, seen), 0)
    );
  };
  const sizes = roots.map((root) => size(root, new Set()));
  const total = sizes.reduce((sum, n) => sum + n, 0) || 1;
  let offset = -Math.PI / 2;
  const place = (
    node: number,
    x: number,
    y: number,
    direction: number,
    spread: number,
    seen: Set<number>,
  ) => {
    if (seen.has(node)) return;
    seen.add(node);
    targets[node] = { x, y };
    const siblings = children[node];
    for (let i = 0; i < siblings.length; i++) {
      const angle =
        direction +
        (siblings.length === 1
          ? 0
          : (i / (siblings.length - 1) - 0.5) * spread);
      const childX = Math.max(
        15,
        Math.min(width - 15, x + Math.cos(angle) * step),
      );
      const childY = Math.max(
        15,
        Math.min(height - 15, y + Math.sin(angle) * step),
      );
      place(
        siblings[i],
        childX,
        childY,
        angle,
        Math.max(0.6, spread * 0.7),
        seen,
      );
    }
  };
  roots.forEach((root, index) => {
    const sector = (Math.PI * 2 * sizes[index]) / total;
    const angle = offset + sector / 2;
    const rootRadius = roots.length === 1 ? 0 : radius * 0.23;
    place(
      root,
      width / 2 + Math.cos(angle) * rootRadius,
      height / 2 + Math.sin(angle) * rootRadius,
      angle,
      Math.min(Math.PI * 1.5, Math.max(1.2, sector)),
      new Set(),
    );
    offset += sector;
  });
  return targets;
}

/** Collect the resolved connected components of the dependency forest. */
export function relationGroups(
  parents: (number | null)[],
  resolved: boolean[],
): number[][] {
  const leaders = parents.map((_, i) => i);
  const find = (index: number): number => {
    let root = index;
    while (leaders[root] !== root) root = leaders[root];
    let current = index;
    while (leaders[current] !== current) {
      const next = leaders[current];
      leaders[current] = root;
      current = next;
    }
    return root;
  };
  parents.forEach((parent, index) => {
    if (
      !resolved[index] ||
      parent === null ||
      parent < 0 ||
      parent >= parents.length ||
      !resolved[parent]
    )
      return;
    leaders[find(index)] = find(parent);
  });
  const groups = new Map<number, number[]>();
  parents.forEach((_, index) => {
    if (!resolved[index]) return;
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  });
  return [...groups.values()];
}

/** A gentle outward force for an entire group, based on its center. */
export function labelRepulsion(
  point: Point,
  label: { left: number; top: number; right: number; bottom: number },
  angle: number,
): Point {
  const centerX = (label.left + label.right) / 2;
  const centerY = (label.top + label.bottom) / 2;
  const radius =
    Math.hypot(label.right - label.left, label.bottom - label.top) / 2 + 35;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return { x: 0, y: 0 };
  const strength = Math.min(2.5, (radius - distance + 4) * 0.018);
  return distance > 0.001
    ? { x: (dx / distance) * strength, y: (dy / distance) * strength }
    : { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
}

/** Separate nearby nodes while keeping the force bounded at zero distance. */
export function nodeRepulsion(
  a: Point,
  b: Point,
  angle: number,
  options: { directlyLinked?: boolean; bothKeyframes?: boolean } = {},
): Point {
  if (options.directlyLinked) return { x: 0, y: 0 };
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.hypot(dx, dy);
  const range = options.bothKeyframes ? 120 : 90;
  if (distance >= range) return { x: 0, y: 0 };
  const strength = (range - distance) * (options.bothKeyframes ? 0.07 : 0.09);
  return distance > 0.001
    ? { x: (dx / distance) * strength, y: (dy / distance) * strength }
    : { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
}

/** Keep each descendant near the ring for its depth around the root. */
export function descendantOutwardForce(
  root: Point,
  child: Point,
  depth: number,
  angle: number,
): Point {
  if (depth <= 0) return { x: 0, y: 0 };
  const dx = child.x - root.x;
  const dy = child.y - root.y;
  const distance = Math.hypot(dx, dy);
  const desiredDistance = depth * 85;
  const strength = Math.max(
    -6,
    Math.min(6, (desiredDistance - distance) * 0.045),
  );
  return distance > 0.001
    ? { x: (dx / distance) * strength, y: (dy / distance) * strength }
    : { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
}

/** Resolve each slide's root and depth through already confirmed parent links. */
export function relationAncestry(
  parents: (number | null)[],
  resolved: boolean[],
): ({ root: number; depth: number } | null)[] {
  return parents.map((_, index) => {
    if (!resolved[index]) return null;
    let root = index;
    let depth = 0;
    const seen = new Set<number>();
    while (!seen.has(root)) {
      seen.add(root);
      const parent = parents[root];
      if (
        parent === null ||
        parent === undefined ||
        parent < 0 ||
        parent >= parents.length ||
        !resolved[parent]
      )
        break;
      root = parent;
      depth++;
    }
    return { root, depth };
  });
}
