import { afterEach, beforeEach, expect, it, vi } from "vitest";

const secret = "test-secret-value-at-least-32-characters-long";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("AUTH_URL", "");
  vi.stubEnv("NEXTAUTH_URL", "");
  vi.stubEnv("DISCORD_CLIENT_ID", "123456789");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "test-discord-secret");
  vi.stubEnv(
    "IRON_SESSION_PASSWORD",
    "test-password-with-at-least-thirty-two-characters",
  );
  vi.stubEnv("IRON_SESSION_COOKIE_NAME", "imageslide_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("starts Discord OAuth with a CSRF cookie and the public origin", async () => {
  const { authHandler } = await import("@/auth");
  const csrf = await authHandler(
    new Request("http://localhost:3212/api/auth/csrf", {
      headers: {
        "x-forwarded-host": "slides.example.com",
        "x-forwarded-proto": "https",
      },
    }),
  );
  const token = (await csrf.json()).csrfToken as string;
  const cookie = csrf.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(token).toBeTruthy();
  const response = await authHandler(
    new Request("http://localhost:3212/api/auth/signin/discord", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-auth-return-redirect": "1",
        "x-forwarded-host": "slides.example.com",
        "x-forwarded-proto": "https",
        cookie,
      },
      body: new URLSearchParams({
        csrfToken: token,
        callbackUrl: "https://slides.example.com/",
      }),
    }),
  );
  const target = new URL((await response.json()).url);
  expect(target.hostname).toBe("discord.com");
  expect(target.searchParams.get("redirect_uri")).toBe(
    "https://slides.example.com/api/auth/callback/discord",
  );

  const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ access_token: "test-token", token_type: "Bearer" }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const callbackCookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const callback = new URL(
    "https://slides.example.com/api/auth/callback/discord",
  );
  callback.searchParams.set("code", "test-code");
  callback.searchParams.set("state", target.searchParams.get("state") ?? "");
  callback.searchParams.set("iss", "https://discord.com");
  await authHandler(
    new Request(callback, { headers: { cookie: callbackCookie } }),
  );
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
    "https://discord.com/api/oauth2/token",
  );

  fetchMock.mockClear();
  callback.searchParams.set("iss", "https://example.com");
  await authHandler(
    new Request(callback, { headers: { cookie: callbackCookie } }),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps issued upload IDs in a signed cookie across requests", async () => {
  const { withRequest, appendContextCookies } = await import(
    "@/server/context"
  );
  const { getSession } = await import("@/lib/iron-session");
  const response = await withRequest(
    new Request("http://localhost/api/upload/normal/init"),
    async () => {
      const session = await getSession();
      session.fileId = ["issued-id"];
      await session.save();
      return appendContextCookies(Response.json({ ok: true }));
    },
  );
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  const ids = await withRequest(
    new Request("http://localhost/", { headers: { cookie } }),
    async () => (await getSession()).fileId,
  );
  expect(ids).toEqual(["issued-id"]);
});
