import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/legal/prose";

export const metadata: Metadata = { title: "About", description: "What MangaForEver is, where its data comes from, and how it stays legal and free." };

export default function AboutPage() {
  return (
    <Prose title="About MangaForEver">
      <p>
        MangaForEver is a free home for reading, tracking and reviewing manga, manhwa and manhua. It keeps a live database of series that updates itself
        when new chapters come out, and gives every member a profile, reading lists, favorites and reviews, without pop-ups or redirect ads.
      </p>
      <h2>Where the data comes from</h2>
      <ul>
        <li>Series information, covers and scores come from <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList</a>, refreshed daily.</li>
        <li>New-chapter information comes from <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">MangaDex</a>&apos;s public API, checked every 15 minutes.</li>
        <li>Ratings, reviews, rankings and recommendations come from MangaForEver members. Every ranking explains its formula on the <Link href="/rankings">rankings page</Link>.</li>
      </ul>
      <h2>Reading chapters</h2>
      <p>
        MangaForEver only shows chapter pages it has the right to host, such as works submitted by their creators, public-domain works and Creative
        Commons works. For everything else, the reader opens the official publisher (MANGA Plus, WEBTOON, Tapas and others) so creators are paid. Your
        progress still saves to your list.
      </p>
      <h2>Contact</h2>
      <p>
        For rights questions see the <Link href="/dmca">DMCA page</Link>. For anything else, open an issue on the project&apos;s GitHub repository.
      </p>
    </Prose>
  );
}
