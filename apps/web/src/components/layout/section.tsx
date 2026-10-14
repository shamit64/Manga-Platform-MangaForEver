import Link from "next/link";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  href,
  hrefLabel = "See all",
  children,
  className,
  aside,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
  id?: string;
}) {
  return (
    <section className={cn("py-8", className)} aria-labelledby={id ?? undefined}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-2xl">
          <h2 id={id} className="text-2xl font-bold sm:text-[1.7rem]">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {aside}
          {href && (
            <Link href={href} className="text-sm font-medium text-lilac hover:underline underline-offset-4">
              {hrefLabel}
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="relative pt-10 pb-6">
      <div className="tone tone-fade pointer-events-none absolute inset-x-0 top-0 -z-10 h-40" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
          {description && <p className="mt-2 text-muted">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted [&_svg]:size-8">{icon}</div>}
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ title = "This section couldn't load", description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm">
      <p className="font-semibold text-danger">{title}</p>
      {description && <p className="mt-1 text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
