import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/legal/prose";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="15 October 2026">
      <p>This policy explains what MangaForEver stores about you and why. We collect as little as we can and never sell your data.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your account: email address, username, a securely hashed password, and the profile details you choose to add.</li>
        <li>Your reading: list entries, progress, scores, favorites, reviews, chapter reactions and comments, follows and notifications.</li>
        <li>Optional history: series you viewed and searches you ran. Both can be turned off and cleared in <Link href="/settings">Settings</Link>.</li>
        <li>Sign-in sessions: a random token in an httpOnly cookie, stored only as a hash on our side.</li>
        <li>Push notifications: if you turn them on, your browser&apos;s push endpoint.</li>
      </ul>
      <h2>Email</h2>
      <p>We send account emails (confirmation, password reset) and, only if you opt in, a daily digest of new chapters. Email is delivered by Resend.</p>
      <h2>Analytics and cookies</h2>
      <p>We use privacy-friendly page analytics without advertising cookies or cross-site tracking. The only cookie we set is your sign-in session.</p>
      <h2>Your choices</h2>
      <ul>
        <li>Make your list, favorites and stats private in Settings.</li>
        <li>Ask for a copy or deletion of your account by contacting us; deletion removes your account and everything linked to it.</li>
      </ul>
      <h2>Third parties</h2>
      <p>Cover images load from AniList&apos;s servers. Links to publishers take you to their sites, which have their own privacy policies.</p>
    </Prose>
  );
}
