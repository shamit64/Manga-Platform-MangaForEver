import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, RegisterForm } from "@/components/auth/auth-forms";
import { getMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getMe()) redirect("/dashboard");
  return (
    <AuthCard
      title="Create your account"
      description="Track what you read, rate it, and get recommendations that explain themselves."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-lilac hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
