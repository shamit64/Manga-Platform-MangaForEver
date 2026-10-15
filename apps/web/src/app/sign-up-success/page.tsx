import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, ResendVerification } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default async function SignUpSuccessPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard
      title="Check your email"
      description="One more step and your account is ready."
      footer={
        <>
          Already confirmed?{" "}
          <Link href="/login" className="text-lilac hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-md border border-line bg-raised p-4 text-sm">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-lilac" aria-hidden />
          <p>
            We sent a confirmation link to {email ? <strong className="font-semibold">{email}</strong> : "your email address"}. Open it within 24 hours to
            finish signing up. It signs you in automatically.
          </p>
        </div>
        <p className="text-sm text-muted">Nothing there after a few minutes? Check your spam or promotions folder, or send a new link.</p>
        {email && <ResendVerification email={email} className="w-full" />}
      </div>
    </AuthCard>
  );
}
