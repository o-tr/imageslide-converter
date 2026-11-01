import { describe, expect, it } from "vitest";
import { sha256Base64 } from "./sha256Base64";

describe("sha256Base64", () => {
  it("matches the known digest of 'hello'", async () => {
    expect(await sha256Base64(new TextEncoder().encode("hello"))).toBe(
      "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=",
    );
  });
});
