import type { Metadata } from "next";
import { Prose } from "@/components/legal/prose";

export const metadata: Metadata = { title: "DMCA and takedown requests" };

export default function DmcaPage() {
  return (
    <Prose title="DMCA and takedown requests" updated="15 October 2026">
      <p>
        MangaForEver respects creators. We do not scrape or copy chapters from scan sites; pages are hosted only for works we have the right to show,
        and every other chapter links to its official publisher.
      </p>
      <p>If you believe something on MangaForEver infringes your rights, send a notice that includes:</p>
      <ul>
        <li>Your name, contact details and the rights you hold (or represent).</li>
        <li>The exact MangaForEver URLs of the material.</li>
        <li>A statement that you believe in good faith the use is not authorised, and that your notice is accurate.</li>
        <li>Your physical or electronic signature.</li>
      </ul>
      <p>
        Send it to the takedown address configured for this site (shown on the About page) or open a confidential report through the project&apos;s
        GitHub repository. We act on valid notices within 48 hours and tell the member who posted the material, who may send a counter-notice.
      </p>
    </Prose>
  );
}
