import { redirect } from "next/navigation";

/** /search?q=… is an alias for the Explore results page. */
export default async function SearchAlias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  redirect(`/explore${p.toString() ? `?${p}` : ""}`);
}
