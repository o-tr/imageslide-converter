import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = { request: Request; response: Response };
const context = new AsyncLocalStorage<RequestContext>();
export const withRequest = <T>(request: Request, fn: () => T): T =>
  context.run({ request, response: new Response() }, fn);
export function currentRequest(): RequestContext {
  const value = context.getStore();
  if (!value) throw new Error("Request context unavailable");
  return value;
}
export function appendContextCookies(response: Response): Response {
  const cookies = currentRequest().response.headers.getSetCookie();
  if (!cookies.length) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
