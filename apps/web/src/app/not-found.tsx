import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="rank-numeral text-[8rem]">404</p>
      <h1 className="mt-4 text-3xl font-extrabold">This page isn’t in the catalog</h1>
      <p className="mt-2 max-w-md text-muted">The link may be old, or the series may have been merged or archived. Try searching for it instead.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/explore">Browse the catalog</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
