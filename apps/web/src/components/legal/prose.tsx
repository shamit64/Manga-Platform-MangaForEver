import { PageHeader } from "@/components/layout/section";

/** Long-form text pages (About, Privacy, Terms, DMCA) set in the editorial serif. */
export function Prose({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} description={updated ? `Last updated ${updated}` : undefined} />
      <div className="prose-mf mt-8 space-y-5 text-[1.05rem] leading-relaxed text-text/90 [&_a]:text-lilac [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}
