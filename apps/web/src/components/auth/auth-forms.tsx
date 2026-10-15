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
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-7 sm:p-9">
        <div className="tone tone-fade pointer-events-none absolute inset-x-0 top-0 h-28" aria-hidden />
        <h1 className="relative text-3xl font-medium">{title}</h1>
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

/** Sends a fresh confirmation link. The API answers the same way whether or not the account exists. */
export function ResendVerification({ email, className }: { email: string; className?: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");
  async function resend() {
    setState("sending");
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email } });
      setState("sent");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Couldn't send a new link");
    }
  }
  return (
    <Button type="button" variant="outline" className={className} onClick={resend} disabled={state !== "idle"}>
      {state === "sent" ? "New link sent" : state === "sending" ? "Sending…" : "Resend confirmation email"}
    </Button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { setUser } = useAuth();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [unverified, setUnverified] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  async function submit(values: z.input<typeof loginSchema>) {
    setFormError(null);
    try {
      const { user } = await api<{ user: Me }>("/auth/login", { method: "POST", body: values });
      setUser(user);
      toast.success(`Welcome back, ${user.displayName ?? user.username}`);
      router.push(sp.get("next") ? safeNext(sp.get("next")) : "/dashboard");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_NOT_VERIFIED") {
        setUnverified((e.details as unknown as { email?: string } | undefined)?.email ?? (values.identifier.includes("@") ? values.identifier : ""));
        setFormError(e.message);
        return;
      }
      applyErrors(e, setError, setFormError);
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <FormAlert message={formError} />
      {unverified ? <ResendVerification email={unverified} className="w-full" /> : null}
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
  const [agreed, setAgreed] = React.useState(false);
  const { register, handleSubmit, setError, formState } = useForm<z.input<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });

  async function submit(values: z.input<typeof registerSchema>) {
    setFormError(null);
    if (!agreed) {
      setFormError("Please accept the Terms and Privacy Policy to create an account.");
      return;
    }
    try {
      const res = await api<{ user: Me | null; verificationRequired?: boolean; email?: string }>("/auth/register", { method: "POST", body: values });
      if (!res.user) {
        router.push(`/sign-up-success?email=${encodeURIComponent(res.email ?? values.email)}`);
        return;
      }
      const user = res.user;
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
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--violet)]" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="text-lilac hover:underline">Terms</Link> and{" "}
          <Link href="/privacy" className="text-lilac hover:underline">Privacy Policy</Link>.
        </span>
      </label>
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

/** Consumes the emailed confirmation link, signs the member in and sends them to their dashboard. */
export function VerifyEmail() {
  const sp = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const token = sp.get("token") ?? "";
  const [error, setError] = React.useState<string | null>(token ? null : "This confirmation link is missing its token.");
  const started = React.useRef(false);
  React.useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api<{ user: Me }>("/auth/verify-email", { method: "POST", body: { token } })
      .then(({ user }) => {
        setUser(user);
        toast.success("Email confirmed. Welcome to MangaForEver!");
        router.replace("/settings?welcome=1");
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "This link couldn't be used."));
  }, [token, router, setUser]);
  if (error) {
    return (
      <div className="space-y-4">
        <FormAlert message={error} />
        <p className="text-sm text-muted">Links expire after 24 hours and work once. Sign in to request a new one.</p>
        <Button asChild className="w-full" size="lg"><Link href="/login">Go to sign in</Link></Button>
      </div>
    );
  }
  return <p role="status" className="text-sm text-muted">Confirming your email…</p>;
}
