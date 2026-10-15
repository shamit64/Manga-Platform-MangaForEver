"use client";

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type Me,
} from "@mangaforever/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";

function safeNext(raw: string | null) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function applyErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, setFormError: (m: string) => void) {
  if (e instanceof ApiError && e.details?.length) {
    e.details.forEach((d) => setError(d.path as Path<T>, { message: d.message }));
  } else setFormError(e instanceof Error ? e.message : "Something went wrong. Try again.");
}

export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md py-14">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-7 sm:p-9">
        <div className="tone tone-fade pointer-events-none absolute inset-x-0 top-0 h-28" aria-hidden />
        <h1 className="relative text-3xl font-extrabold">{title}</h1>
        {description && <p className="relative mt-2 text-sm text-muted">{description}</p>}
        <div className="relative mt-7">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { setUser } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  async function submit(values: z.input<typeof loginSchema>) {
    setFormError(null);
    try {
      const { user } = await api<{ user: Me }>("/auth/login", { method: "POST", body: values });
      setUser(user);
      toast.success(`Welcome back, ${user.displayName ?? user.username}`);
      router.push(safeNext(sp.get("next")));
      router.refresh();
    } catch (e) {
      applyErrors(e, setError, setFormError);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <FormAlert message={formError} />
      <div>
        <Label htmlFor="identifier">Email or username</Label>
        <Input id="identifier" autoComplete="username" aria-invalid={!!formState.errors.identifier} {...register("identifier")} />
        <FieldError>{formState.errors.identifier?.message}</FieldError>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="mb-1.5 text-sm text-lilac hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        <FieldError>{formState.errors.password?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { setUser } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });

  async function submit(values: z.input<typeof registerSchema>) {
    setFormError(null);
    try {
      const { user } = await api<{ user: Me }>("/auth/register", { method: "POST", body: values });
      setUser(user);
      toast.success("Account created — welcome to MangaForEver");
      router.push(safeNext(sp.get("next")) === "/" ? "/settings?welcome=1" : safeNext(sp.get("next")));
      router.refresh();
    } catch (e) {
      applyErrors(e, setError, setFormError);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <FormAlert message={formError} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
        <FieldError>{formState.errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="username">Username</Label>
        <Input id="username" autoComplete="username" aria-invalid={!!formState.errors.username} aria-describedby="username-hint" {...register("username")} />
        <p id="username-hint" className="mt-1 text-xs text-muted">3–24 letters, numbers or underscores. Shown on your public profile.</p>
        <FieldError>{formState.errors.username?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} aria-describedby="pw-hint" {...register("password")} />
        <p id="pw-hint" className="mt-1 text-xs text-muted">At least 8 characters with a letter and a number.</p>
        <FieldError>{formState.errors.password?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) });
  async function submit(values: z.input<typeof forgotPasswordSchema>) {
    setFormError(null);
    try {
      await api("/auth/forgot-password", { method: "POST", body: values });
      setSent(true);
    } catch (e) {
      applyErrors(e, setError, setFormError);
    }
  }
  if (sent) {
    return (
      <p className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok" role="status">
        If an account exists for that email, a reset link is on its way. It expires in one hour.
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <FormAlert message={formError} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
        <FieldError>{formState.errors.email?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

const resetForm = resetPasswordSchema.pick({ password: true }).extend({ confirm: z.string() }).refine((v) => v.password === v.confirm, {
  path: ["confirm"],
  message: "Passwords don't match",
});

export function ResetPasswordForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const [formError, setFormError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof resetForm>>({ resolver: zodResolver(resetForm) });
  if (!token) return <FormAlert message="This reset link is missing its token. Request a new link." />;

  async function submit(values: z.input<typeof resetForm>) {
    setFormError(null);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password: values.password } });
      toast.success("Password updated — sign in with your new password");
      router.push("/login");
    } catch (e) {
      applyErrors(e, setError, setFormError);
    }
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <FormAlert message={formError} />
      <div>
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        <FieldError>{formState.errors.password?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.confirm} {...register("confirm")} />
        <FieldError>{formState.errors.confirm?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}
