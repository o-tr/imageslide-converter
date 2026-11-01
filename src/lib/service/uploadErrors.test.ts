import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNormalFileId } from "./getNormalFileId";
import { getNormalPreSignedPut } from "./getNormalPreSignedPut";
import { postRegisterFile } from "./postRegisterFile";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

describe("upload API failures", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["initialization", (signal: AbortSignal) => getNormalFileId(signal)],
    [
      "upload URL generation",
      (signal: AbortSignal) =>
        getNormalPreSignedPut("id", 4, `${"A".repeat(43)}=`, signal),
    ],
    [
      "registration",
      (signal: AbortSignal) =>
        postRegisterFile("id", "file", 4, "format", 1, signal),
    ],
  ])(
    "propagates an HTTP failure from %s and forwards cancellation",
    async (_stage, request) => {
      const failure = new Error("HTTP 500");
      vi.mocked(axios.post).mockRejectedValue(failure);
      const signal = new AbortController().signal;
      await expect(request(signal)).rejects.toBe(failure);
      expect(vi.mocked(axios.post).mock.calls[0][2]).toMatchObject({ signal });
    },
  );

  it("rejects an error response even when the HTTP request succeeds", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: "error", error: "failed" },
    });
    await expect(getNormalFileId()).rejects.toThrow();
  });
});
