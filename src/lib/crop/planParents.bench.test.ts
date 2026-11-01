// Offline comparison of keyframe-interval cropping and graph-planned cropping.
// Run: CROP_BENCH=1 npx vitest run src/lib/crop/planParents.bench.test.ts
import { Buffer } from "buffer";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { RawImageObjV1 } from "@/_types/text-zip/v1";
import { compressEIAv1 } from "@/lib/eia/compressEIAv1";
import { EiaCompressionCache } from "@/lib/eia/compressionCache";
import lz4 from "lz4js";
import { describe, it } from "vitest";
import { cropImages } from "./cropImages";
import { nearLossless } from "./nearLossless";
import { planParents } from "./planParents";

const W = 640;
const H = 360;

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
};

type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  photo: boolean;
};

const render = (bg: number[], blocks: Block[]) => {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) buf.set(bg, i * 3);
  for (const b of blocks) {
    const r = rng(b.seed);
    for (let y = b.y; y < b.y + b.h && y < H; y++)
      for (let x = b.x; x < b.x + b.w && x < W; x++) {
        const p = (y * W + x) * 3;
        if (b.photo) {
          const v = (r() * 255) | 0;
          buf[p] = (v + x) & 255;
          buf[p + 1] = v;
          buf[p + 2] = (v + y) & 255;
        } else {
          const ink = y % 14 < 5 && r() < 0.7 ? 30 : bg[0];
          buf[p] = ink;
          buf[p + 1] = ink;
          buf[p + 2] = ink;
        }
      }
  }
  return buf;
};

/** Sections that build up block by block; some slides revisit earlier states. */
export const makeDeck = (sections: number, seed: number): RawImageObjV1[] => {
  const r = rng(seed);
  const states: Buffer[] = [];
  const out: Buffer[] = [];
  for (let s = 0; s < sections; s++) {
    const bg = [230 + ((r() * 20) | 0), 230 + ((r() * 20) | 0), 240];
    const blocks: Block[] = [];
    const steps = 3 + ((r() * 6) | 0);
    for (let k = 0; k < steps; k++) {
      blocks.push({
        x: (r() * (W - 200)) | 0,
        y: 20 + ((r() * (H - 100)) | 0),
        w: 80 + ((r() * 120) | 0),
        h: 30 + ((r() * 60) | 0),
        seed: (r() * 1e9) | 0,
        photo: r() < 0.12,
      });
      const frame = render(bg, blocks);
      states.push(frame);
      out.push(frame);
      // revisit: jump back to a previous state of this or earlier section
      if (r() < 0.25 && states.length > 3) {
        out.push(states[(r() * (states.length - 1)) | 0]);
      }
    }
  }
  return out.map((buffer, index) => ({
    index,
    rect: { width: W, height: H },
    format: "RGB24",
    buffer,
  }));
};

const measure = async (
  label: string,
  deck: RawImageObjV1[],
  crop: (c: EiaCompressionCache) => ReturnType<typeof cropImages>,
) => {
  const cache = new EiaCompressionCache();
  const t0 = performance.now();
  const cropped = crop(cache);
  const t1 = performance.now();
  const out = await compressEIAv1(cropped, undefined, undefined, cache);
  if (process.env.CROP_WRITE)
    writeFileSync(
      `${process.env.CROP_WRITE}/${label.replace(/[^a-z0-9]+/gi, "_")}.eia`,
      out,
    );
  const t2 = performance.now();
  const byIndex = new Map(cropped.map((c) => [c.index, c]));
  const depth = (i: number): number => {
    const c = byIndex.get(i);
    return c?.cropped ? 1 + depth(c.cropped.baseIndex) : 0;
  };
  const masters = cropped.filter((c) => !c.cropped).length;
  const maxDepth = Math.max(...cropped.map((c) => depth(c.index)));
  const own = (c: (typeof cropped)[number]) =>
    c.cropped
      ? c.cropped.rects.reduce((x, r) => x + r.buffer.length, 0)
      : c.buffer.length;
  const chain = (i: number): number => {
    const c = byIndex.get(i) as (typeof cropped)[number];
    return own(c) + (c.cropped ? chain(c.cropped.baseIndex) : 0);
  };
  const chainTotal = cropped.reduce((a, c) => a + chain(c.index), 0);
  const masterBytes = out.length ? cropped.filter((c) => !c.cropped).length : 0;
  const rectCount = cropped.reduce(
    (a, c) => a + (c.cropped?.rects.length ?? 0),
    0,
  );
  const deltaRaw = cropped.reduce((a, c) => a + (c.cropped ? own(c) : 0), 0);
  void masterBytes;
  const decoded = cropped.reduce(
    (a, c) =>
      a +
      (c.cropped
        ? c.cropped.rects.reduce((x, r) => x + r.buffer.length, 0)
        : c.buffer.length),
    0,
  );
  console.log(
    `${label.padEnd(22)} size=${out.length.toString().padStart(9)}` +
      ` masters=${masters.toString().padStart(3)}/${deck.length} maxDepth=${maxDepth}` +
      ` rects=${rectCount} deltaRawMB=${(deltaRaw / 1e6).toFixed(1)} decodedMB=${(decoded / 1e6).toFixed(2)} chainMB=${(chainTotal / 1e6).toFixed(1)} crop=${(t1 - t0).toFixed(0)}ms enc=${(t2 - t1).toFixed(0)}ms`,
  );
};

describe.skipIf(!process.env.CROP_BENCH)(
  "graph plan vs keyframe interval",
  () => {
    for (const [sections, seed] of [
      [8, 11],
      [12, 23],
    ] as const) {
      it(`deck sections=${sections}`, async () => {
        const deck = makeDeck(sections, seed);
        console.log(`--- deck ${deck.length} slides`);
        await measure("legacy(kf10)", deck, (cache) =>
          cropImages(deck, {
            keyframeInterval: 10,
            optimizeEia: true,
            compressionCache: cache,
          }),
        );
        for (const [label, extra] of [
          ["plan d3 pen0", { depthPenalty: 0 }],
          ["plan d3 pen1500", {}],
          ["plan d4 pen500", { maxDepth: 4, depthPenalty: 500 }],
          ["plan d6 pen0", { maxDepth: 6, depthPenalty: 0 }],
          ["plan d6 pen500", { maxDepth: 6, depthPenalty: 500 }],
          ["plan d6 pen1500", { maxDepth: 6 }],
        ] as const) {
          await measure(label, deck, (cache) => {
            const tp = performance.now();
            const plan = planParents(deck, {
              estimateSize: (p) => lz4.compress(p).length,
              ...extra,
            });
            console.log(`  planning ${(performance.now() - tp).toFixed(0)}ms`);
            return cropImages(deck, {
              optimizeEia: true,
              compressionCache: cache,
              parentPlan: plan,
            });
          });
        }
      }, 600000);
    }
  },
);

// Real decks: CROP_DECK_DIR holds <name>.rgb (concatenated RGB24 pages) and
// <name>.json ([{w,h}...]); CROP_DECKS optionally filters by name.
const loadDeck = (dir: string, name: string): RawImageObjV1[] => {
  const meta = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8")) as {
    w: number;
    h: number;
  }[];
  const all = readFileSync(`${dir}/${name}.rgb`);
  let offset = 0;
  return meta.map(({ w, h }, index) => {
    const buffer = Buffer.from(all.subarray(offset, offset + w * h * 3));
    offset += w * h * 3;
    return { index, rect: { width: w, height: h }, format: "RGB24", buffer };
  });
};

const deckDir = process.env.CROP_DECK_DIR;
describe.skipIf(!deckDir || !existsSync(deckDir))("real decks", () => {
  const names = deckDir
    ? readdirSync(deckDir)
        .filter((f) => f.endsWith(".rgb"))
        .map((f) => f.slice(0, -4))
        .filter(
          (n) =>
            !process.env.CROP_DECKS ||
            process.env.CROP_DECKS.split(",").includes(n),
        )
    : [];
  for (const name of names) {
    it(`deck ${name}`, async () => {
      const deck = loadDeck(deckDir as string, name);
      console.log(`--- ${name}: ${deck.length} slides`);
      await measure("legacy(kf10)", deck, (cache) =>
        cropImages(deck, {
          keyframeInterval: 10,
          optimizeEia: true,
          compressionCache: cache,
        }),
      );
      for (const [label, extra] of [
        ["plan d3 pen0", { depthPenalty: 0 }],
        ["plan d4 pen500", { maxDepth: 4, depthPenalty: 500 }],
        ["plan d6 pen500", { maxDepth: 6, depthPenalty: 500 }],
        ["plan d6 pen1500", { maxDepth: 6 }],
      ] as const) {
        await measure(label, deck, (cache) => {
          const tp = performance.now();
          const plan = planParents(deck, {
            estimateSize: (p) => lz4.compress(p).length,
            ...extra,
          });
          console.log(`  planning ${(performance.now() - tp).toFixed(0)}ms`);
          return cropImages(deck, {
            optimizeEia: true,
            compressionCache: cache,
            parentPlan: plan,
          });
        });
      }
    }, 3_600_000);
  }
});

describe.skipIf(!deckDir || !process.env.CROP_NL)("near-lossless", () => {
  for (const name of (process.env.CROP_DECKS ?? "")
    .split(",")
    .filter(Boolean)) {
    it(`nl ${name}`, async () => {
      const raw = loadDeck(deckDir as string, name);
      console.log(`--- ${name}: ${raw.length} slides`);
      for (const tol of (process.env.CROP_TOLS ?? "0,1,2,3,5")
        .split(",")
        .map(Number)) {
        const deck = raw.map((d) => ({
          ...d,
          buffer: nearLossless(d.buffer, d.rect.width, d.rect.height, tol),
        }));
        await measure(`nl tol=${tol}`, deck, (cache) => {
          const tp = performance.now();
          const plan = planParents(deck, {
            estimateSize: (p) => lz4.compress(p).length,
            maxDepth: 6,
            depthPenalty: 1500,
            evaluated: Number(process.env.EVAL ?? 4),
          });
          console.log(`  planning ${(performance.now() - tp).toFixed(0)}ms`);
          return cropImages(deck, {
            optimizeEia: true,
            compressionCache: cache,
            parentPlan: plan,
          });
        });
      }
    }, 3_600_000);
  }
});

// Write archives for decoder benchmarking: CROP_WRITE=<dir> CROP_DUMP=1.
describe.skipIf(!deckDir || !process.env.CROP_DUMP || !process.env.CROP_WRITE)(
  "dump",
  () => {
    for (const name of (process.env.CROP_DECKS ?? "")
      .split(",")
      .filter(Boolean)) {
      it(`dump ${name}`, async () => {
        const raw = loadDeck(deckDir as string, name);
        const out = process.env.CROP_WRITE as string;
        await measure(`${name}_legacy`, raw, (cache) =>
          cropImages(raw, {
            keyframeInterval: 10,
            optimizeEia: true,
            compressionCache: cache,
          }),
        );
        for (const tol of [0, 2]) {
          const deck = raw.map((d) => ({
            ...d,
            buffer: nearLossless(d.buffer, d.rect.width, d.rect.height, tol),
          }));
          await measure(`${name}_plan_nl${tol}`, deck, (cache) => {
            const plan = planParents(deck, {
              estimateSize: (p) => lz4.compress(p).length,
              maxDepth: 6,
              depthPenalty: 1500,
            });
            return cropImages(deck, {
              optimizeEia: true,
              compressionCache: cache,
              parentPlan: plan,
            });
          });
        }
        void out;
      }, 3_600_000);
    }
  },
);
