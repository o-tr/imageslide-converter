import { currentRequest } from "@/server/context";
import { Auth, type AuthConfig } from "@auth/core";
import Discord from "@auth/core/providers/discord";

export const authConfig: AuthConfig = {
  basePath: "/api/auth",
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/login", error: "/", newUser: "/mypage" },
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
    jwt({ token, trigger, session, account }) {
      if (account) token.id = account.providerAccountId;
      if (trigger === "update" && session?.name) token.name = session.name;
      return token;
    },
  },
};
export function externalUrl(request: Request): URL {
  const url = new URL(request.url);
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) {
    const origin = new URL(configured);
    url.protocol = origin.protocol;
    url.host = origin.host;
    url.port = origin.port;
  } else {
    const protocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (protocol === "http" || protocol === "https")
      url.protocol = `${protocol}:`;
    if (host) {
      const origin = new URL(`${url.protocol}//${host}`);
      url.host = origin.host;
      url.port = origin.port;
    }
  }
  return url;
}
export const authHandler = (request: Request) =>
  Auth(new Request(externalUrl(request), request), authConfig);
export async function auth() {
  const { request, response } = currentRequest();
  if (!authConfig.secret) return null;
  const url = new URL("/api/auth/session", externalUrl(request));
  const result = await Auth(
    new Request(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
    }),
    authConfig,
  );
  for (const cookie of result.headers.getSetCookie())
    response.headers.append("set-cookie", cookie);
  if (!result.ok) return null;
  const session = await result.json();
  return session && typeof session === "object" && session.user
    ? session
    : null;
}
