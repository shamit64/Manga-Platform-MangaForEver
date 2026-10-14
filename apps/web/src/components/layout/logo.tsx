import Link from "next/link";

/** Wordmark: three tilted "panels" form the mark — a nod to a manga page layout. */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="MangaVerse home">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="2" y="3" width="11" height="13" rx="2" fill="var(--violet)" transform="rotate(-4 7 9)" />
        <rect x="15" y="2" width="11" height="9" rx="2" fill="var(--indigo)" transform="rotate(3 20 6)" />
        <rect x="15" y="13" width="11" height="13" rx="2" fill="var(--lilac)" transform="rotate(-2 20 19)" />
        <rect x="2" y="18" width="11" height="8" rx="2" fill="var(--line)" />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight" style={{ fontVariationSettings: '"wdth" 85' }}>
        MangaVerse
      </span>
    </Link>
  );
}
