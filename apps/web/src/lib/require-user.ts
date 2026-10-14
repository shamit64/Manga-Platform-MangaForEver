import "server-only";
import { redirect } from "next/navigation";
import { getMe } from "./server-api";

/** Server-side guard for account pages. The API still enforces auth on every request. */
export async function requireUser(path: string) {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(path)}`);
  return me;
}
