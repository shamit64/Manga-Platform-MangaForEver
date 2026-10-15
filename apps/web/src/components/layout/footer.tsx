import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer data-site-chrome className="mt-16 border-t border-line pb-16 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-muted">A live database, tracker and reader for manga, manhwa and manhua. New chapters appear the moment they release.</p>
          <p className="mt-3 max-w-sm text-xs text-muted">
            MangaForEver only shows chapters it has the right to host. Everything else links to the official publisher, so creators get paid.
          </p>
        </div>
        <FooterCol title="Discover" links={[["Browse", "/browse"], ["Latest updates", "/latest"], ["Rankings", "/rankings"], ["Manga", "/manga"], ["Manhwa", "/manhwa"], ["Manhua", "/manhua"]]} />
        <FooterCol title="Your reading" links={[["Dashboard", "/dashboard"], ["My List", "/my-list"], ["Favorites", "/favorites"], ["Notifications", "/notifications"], ["For you", "/recommendations"]]} />
        <FooterCol title="MangaForEver" links={[["About", "/about"], ["How rankings work", "/rankings#how"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["DMCA", "/dmca"]]} />
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted sm:px-6">
        Metadata and cover art from <a className="underline-offset-2 hover:underline" href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList</a>. Chapter data from{" "}
        <a className="underline-offset-2 hover:underline" href="https://mangadex.org" target="_blank" rel="noopener noreferrer">MangaDex</a>. Titles marked “Sample data” come from the bundled sample catalog.
      </p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <ul className="space-y-1.5">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-muted hover:text-text">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
