import Link from "next/link";

/** Wordmark: an editorial serif with the accent on "For", beside a single red panel mark. */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="MangaForEver home">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="3" y="3" width="10" height="22" rx="1.5" fill="var(--violet)" />
        <rect x="15" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="15" y="15" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <span className="font-display text-xl font-medium tracking-tight">
        Manga<em className="text-brand font-medium">For</em>Ever
      </span>
    </Link>
  );
}
