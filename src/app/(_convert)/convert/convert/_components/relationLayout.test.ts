import { describe, expect, it } from "vitest";
import {
  descendantOutwardForce,
  labelRepulsion,
  nodeRepulsion,
  relationAncestry,
  relationGroups,
  relationTargets,
} from "./relationLayout";

describe("relationTargets", () => {
  it("keeps related nodes close while separating independent trees", () => {
    const points = relationTargets(
      [null, 0, 1, null, 3],
      [true, true, true, true, true],
      1000,
      800,
    );
    const distance = (a: number, b: number) => {
      const first = points[a];
      const second = points[b];
      if (!first || !second) throw new Error("Missing point");
      return Math.hypot(first.x - second.x, first.y - second.y);
    };
    expect(distance(0, 1)).toBeLessThan(distance(0, 3));
    expect(distance(1, 2)).toBeLessThan(distance(0, 3));
    expect(distance(3, 4)).toBeLessThan(distance(0, 3));
  });
  it("pushes nearby points away from the label and leaves distant points alone", () => {
    const label = { left: 300, right: 700, top: 300, bottom: 500 };
    expect(labelRepulsion({ x: 500, y: 290 }, label, 0).y).toBeLessThan(0);
    expect(labelRepulsion({ x: 500, y: 510 }, label, 0).y).toBeGreaterThan(0);
    expect(labelRepulsion({ x: 500, y: 100 }, label, 0)).toEqual({
      x: 0,
      y: 0,
    });
  });
  it("groups connected slides and applies repulsion to the group center", () => {
    expect(
      relationGroups([null, 0, 1, null, 3], [true, true, true, true, true]),
    ).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(relationGroups([null, 0, 1], [true, false, true])).toEqual([
      [0],
      [2],
    ]);
    expect(
      nodeRepulsion({ x: 10, y: 10 }, { x: 10, y: 10 }, 0).x,
    ).toBeGreaterThan(0);
    expect(nodeRepulsion({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toEqual({
      x: 0,
      y: 0,
    });
  });
  it("does not repel directly linked slides and separates keyframes at a greater distance", () => {
    const a = { x: 0, y: 0 };
    const near = { x: 30, y: 0 };
    const farther = { x: 100, y: 0 };
    const grandchild = { x: 80, y: 0 };
    expect(nodeRepulsion(a, near, 0, { directlyLinked: true })).toEqual({
      x: 0,
      y: 0,
    });
    expect(nodeRepulsion(a, near, 0).x).toBeLessThan(0);
    // A grandparent and grandchild are not directly connected.
    expect(nodeRepulsion(a, grandchild, 0).x).toBeLessThan(0);
    expect(nodeRepulsion(a, farther, 0)).toEqual({ x: 0, y: 0 });
    expect(
      nodeRepulsion(a, farther, 0, { bothKeyframes: true }).x,
    ).toBeLessThan(0);
  });
  it("pulls each descendant toward the ring for its depth", () => {
    expect(relationAncestry([null, 0, 1], [true, true, true])).toEqual([
      { root: 0, depth: 0 },
      { root: 0, depth: 1 },
      { root: 0, depth: 2 },
    ]);
    const root = { x: 10, y: 10 };
    const child = { x: 20, y: 10 };
    const near = descendantOutwardForce(root, child, 1, 0);
    const far = descendantOutwardForce(root, child, 2, 0);
    expect(near.x).toBeGreaterThan(0);
    expect(far.x).toBeGreaterThan(near.x);
    expect(descendantOutwardForce(root, { x: 95, y: 10 }, 1, 0).x).toBeCloseTo(
      0,
    );
    expect(
      descendantOutwardForce(root, { x: 115, y: 10 }, 1, 0).x,
    ).toBeLessThan(0);
    expect(
      descendantOutwardForce(root, { x: 95, y: 10 }, 2, 0).x,
    ).toBeGreaterThan(0);
    expect(descendantOutwardForce(root, child, 0, 0)).toEqual({ x: 0, y: 0 });
  });
  it("only places resolved nodes and tolerates invalid references", () => {
    const points = relationTargets(
      [null, 0, 99],
      [true, false, true],
      500,
      500,
    );
    expect(points[0]).toBeDefined();
    expect(points[1]).toBeUndefined();
    expect(points[2]).toBeDefined();
  });
});
