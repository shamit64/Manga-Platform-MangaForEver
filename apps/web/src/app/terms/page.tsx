import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/legal/prose";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="15 October 2026">
      <p>By using MangaForEver you agree to these terms. They are short on purpose.</p>
      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13 years old. Mature series are hidden unless you confirm you are 18 or older.</li>
        <li>Keep your password safe. You are responsible for what happens under your account.</li>
      </ul>
      <h2>What you post</h2>
      <ul>
        <li>Reviews and comments must be your own words. No harassment, hate, spam, or unmarked spoilers.</li>
        <li>Do not post links to unlicensed copies of manga. We remove them and may suspend accounts that keep posting them.</li>
        <li>You keep ownership of what you write; you allow MangaForEver to show it on the site.</li>
      </ul>
      <h2>Content on the site</h2>
      <p>
        Series information comes from AniList and chapter information from MangaDex, under their terms. Chapter pages are shown only where we have the
        right to host them. Rights holders can reach us through the <Link href="/dmca">DMCA page</Link>.
      </p>
      <h2>No warranty</h2>
      <p>MangaForEver is a free service provided as is. We may change or stop features, and we may update these terms; the date above shows the latest version.</p>
    </Prose>
  );
}
