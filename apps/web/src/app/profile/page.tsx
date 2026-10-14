import { redirect } from "next/navigation";
import { requireUser } from "@/lib/require-user";

export default async function ProfileRedirect() {
  const me = await requireUser("/profile");
  redirect(`/u/${me.username}`);
}
