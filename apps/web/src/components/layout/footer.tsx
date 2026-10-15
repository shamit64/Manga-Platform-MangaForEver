import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-muted">Discover. Track. Review. Explore. A catalog and reading tracker for manga, manhwa and manhua.</p>
          <p className="mt-3 max-w-sm text-xs text-muted">
            MangaVerse lists metadata only and does not host or link to chapters. Read series through official, licensed publishers.
          </p>
        </div>
        <FooterCol title="Discover" links={[["Explore", "/explore"], ["Rankings", "/rankings"], ["Seasonal", "/seasonal"], ["Latest updates", "/latest"], ["New releases", "/new"]]} />
        <FooterCol title="Your reading" links={[["Library", "/library"], ["Favorites", "/favorites"], ["History", "/history"], ["Recommendations", "/recommendations"]]} />
        <FooterCol title="About the data" links={[["How rankings work", "/rankings#how"], ["Community reviews", "/reviews"], ["API docs", "/api-docs"]]} />
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted sm:px-6">
        Titles marked “Sample data” come from MangaVerse’s bundled sample catalog. Cover art, banners and external scores are provided by AniList (anilist.co) and shown from AniList’s servers; each series page credits its sources.
      </p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-2 font-display font-semibold">{title}</p>
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
