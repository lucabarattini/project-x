import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandLogo } from "@/components/ui/Brand";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { CompanyLogo } from "@/features/companies/CompanyLogo";
import { JobDashboard } from "@/features/jobs/dashboard/JobDashboard";
import { jobBoards, getSnapshot, type ProviderDiagnostic } from "@/features/jobs/service";
import { parseSearchParams, searchJobs } from "@/features/jobs/search";

export const metadata: Metadata = {
  title: "Live openings from company career pages",
  description:
    "Fresh technical and business roles pulled directly from company career pages, with auditable publication dates and experience requirements.",
};

const featuredCompanies = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Stripe",
  "Databricks",
  "Jane Street",
  "Cloudflare",
  "Figma",
];

function SiteHeader({ portal }: { portal: "tech" | "non-tech" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link aria-label="Home" className="flex items-center" href="/">
          <BrandLogo />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <div aria-label="Portal" className="mr-1 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5" role="group">
            <Link
              aria-pressed={portal === "tech"}
              className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-bold transition-colors ${
                portal === "tech" ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-slate-50 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              href="/"
            >
              Tech
            </Link>
            <Link
              aria-pressed={portal === "non-tech"}
              className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-bold transition-colors ${
                portal === "non-tech" ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-slate-50 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              href="/?portal=nontech"
            >
              Non-tech
            </Link>
          </div>
          <Link className="btn btn-ghost !min-h-10 !px-3 !text-sm" href="/hiring-posts">
            Hiring signals
          </Link>
          <a className="btn btn-ghost hidden !min-h-10 !px-3 !text-sm md:inline-flex" href="/api/jobs">
            JSON feed
          </a>
          <a className="btn btn-ghost hidden !min-h-10 !px-3 !text-sm md:inline-flex" href="/job-boards.csv">
            CSV
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function Hero({ portal }: { portal: "tech" | "non-tech" }) {
  return (
    <section className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">
          {portal === "non-tech" ? "Live non-technical openings" : "Live career-page openings"}
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-slate-950 dark:text-slate-50 sm:text-5xl">
          {portal === "non-tech"
            ? "Sales, product, marketing, finance & operations — from the source."
            : "The freshest openings, straight from company career pages."}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400 sm:text-lg">
          {portal === "non-tech"
            ? "The non-technical side of the same feed: business roles pulled directly from official ATS job boards, with publication dates and source links."
            : "Every role is pulled directly from official ATS career pages and shown with its publication date, experience requirement and source link — no aggregator noise, no guesswork."}
        </p>
      </div>
    </section>
  );
}

function StatItem({
  icon,
  label,
  value,
  detail,
}: {
  icon: "briefcase" | "building" | "shield" | "clock";
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-xl font-bold tracking-[-0.03em] text-slate-950 dark:text-slate-50">{value}</p>
          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function LogoRail() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Direct sources</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">One clean feed from official career pages.</p>
        </div>
      </div>
      <div className="rail-scroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {featuredCompanies.map((company) => (
          <span className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 sm:shrink" key={company}>
            <CompanyLogo company={company} size="sm" decorative />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{company}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function AppSkeleton() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-[76px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" key={item} />
        ))}
      </div>
      <div className="mt-6 h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="hidden h-[560px] animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800 lg:block" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" key={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

async function AppSection({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = parseSearchParams(searchParams);
  const snapshot = await getSnapshot();
  const initial = searchJobs(snapshot.entries, params, 0);

  // The "today" window can be nearly empty at some hours. Precompute the
  // totals for the next wider windows so the client can widen automatically
  // instead of rendering a dead feed.
  const defaultDateCounts = params.date === "today"
    ? (["48h", "3d", "week"] as const).map((candidate) => ({
        date: candidate,
        total: searchJobs(snapshot.entries, { ...params, date: candidate }, 0).total,
      }))
    : [];

  const companyCounts = new Map<string, number>();
  for (const entry of snapshot.entries) {
    companyCounts.set(entry.job.company, (companyCounts.get(entry.job.company) ?? 0) + 1);
  }

  const refreshTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(snapshot.fetchedAt));

  const healthyProviders = snapshot.diagnostics.filter((item) => item.status === "ok").length;

  return (
    <>
      <section className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-10">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatItem
            detail="current snapshot"
            icon="briefcase"
            label="Open roles"
            value={snapshot.entries.length.toLocaleString("en-US")}
          />
          <StatItem
            detail="career pages"
            icon="building"
            label="Companies"
            value={new Set(snapshot.entries.map((entry) => entry.job.company)).size.toLocaleString("en-US")}
          />
          <StatItem
            detail={`${healthyProviders} of ${snapshot.diagnostics.length} sources`}
            icon="shield"
            label="Sources healthy"
            value={String(healthyProviders)}
          />
          <StatItem
            detail="Eastern Time"
            icon="clock"
            label="Refreshed"
            value={refreshTime}
          />
        </div>
      </section>

      <LogoRail />

      <JobDashboard
        boards={jobBoards}
        companyCounts={[...companyCounts.entries()]
          .map(([company, count]) => ({ company, count }))
          .sort((left, right) => left.company.localeCompare(right.company))}
        defaultDateCounts={defaultDateCounts}
        diagnostics={snapshot.diagnostics as ProviderDiagnostic[]}
        initial={initial}
        initialParams={params}
        snapshotFetchedAt={snapshot.fetchedAt}
      />
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-slate-700 py-6 text-xs leading-5 text-slate-500 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
        <p>
          This site is not affiliated with or endorsed by LinkedIn or any of the listed companies.
          Data is fetched directly from official ATS career pages.
        </p>
        <div className="flex flex-wrap gap-4">
          <a className="font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-800 dark:hover:text-sky-300" href="/hiring-posts">Hiring signals</a>
          <a className="font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-800 dark:hover:text-sky-300" href="/api/jobs">JSON feed</a>
          <a className="font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-800 dark:hover:text-sky-300" href="/job-boards.csv">Board CSV</a>
        </div>
      </div>
    </footer>
  );
}

export default async function Home(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const portal = parseSearchParams(searchParams).portal;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-950 dark:text-slate-50">
      <a className="skip-link" href="#openings">Skip to jobs</a>
      <SiteHeader portal={portal} />
      <Hero portal={portal} />
      <Suspense fallback={<AppSkeleton />}>
        <AppSection searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
