import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, LoginForm } from "@/components/auth/auth-forms";
import { getMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getMe()) redirect("/dashboard");
  return (
    <AuthCard
      title="Sign in"
      description="Pick up your list, favorites and reviews on any device."
      footer={
        <>
          New to MangaForEver?{" "}
          <Link href="/register" className="text-lilac hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
