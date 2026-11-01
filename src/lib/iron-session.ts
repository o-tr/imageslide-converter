import { IRON_SESSION_COOKIE_NAME, IRON_SESSION_PASSWORD } from "@/const/env";
import { currentRequest } from "@/server/context";
import { type SessionOptions, getIronSession } from "iron-session";
export const sessionOptions: SessionOptions = {
  password: IRON_SESSION_PASSWORD,
  cookieName: IRON_SESSION_COOKIE_NAME,
  cookieOptions: { secure: process.env.NODE_ENV === "production" },
};
type Session = { fileId: string[] };
export const getSession = () => {
  const { request, response } = currentRequest();
  return getIronSession<Session>(request, response, sessionOptions);
};
