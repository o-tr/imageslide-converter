import { DEFAULT_LOGIN_REDIRECT, authRoutes, restrictedRoutes } from "@/routes";
import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
  }
}

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/",
    newUser: "/mypage",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = authRoutes.includes(nextUrl.pathname);
      const isPublicRoute = !restrictedRoutes.some(
        (route) =>
          nextUrl.pathname === route ||
          nextUrl.pathname.startsWith(`${route}/`),
      );

      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
        }

        return true;
      }

      if (!isPublicRoute && !isLoggedIn) {
        return false;
      }

      return true;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
    jwt({ token, trigger, session, account }) {
      if (account) {
        token.id = account.providerAccountId;
      }

      if (trigger === "update") token.name = session.name;
      return token;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
