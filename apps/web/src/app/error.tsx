"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-extrabold">Something went wrong loading this page</h1>
      <p className="mt-2 max-w-md text-muted">The MangaVerse API may be restarting or unreachable. Your library and reviews are safe.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
