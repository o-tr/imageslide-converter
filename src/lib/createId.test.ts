import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "./createId";

afterEach(() => vi.unstubAllGlobals());

describe("createId", () => {
  it("generates a version 4 UUID without randomUUID on HTTP origins", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
    });
    expect(createId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("uses randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "native-id" });
    expect(createId()).toBe("native-id");
  });
});
