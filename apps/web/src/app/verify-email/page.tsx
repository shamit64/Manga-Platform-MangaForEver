import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, VerifyEmail } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Confirming your email">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
