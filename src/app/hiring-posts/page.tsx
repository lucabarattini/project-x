import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BrandLogo } from "@/components/ui/Brand";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  isHiringPostsViewer,
  isHiringPostsViewingConfigured,
} from "@/features/hiring-posts/access";
import { HiringPostDashboard } from "@/features/hiring-posts/HiringPostDashboard";
import {
  hiringPostCompanyCycleHours,
  hiringPostScanCadenceHours,
} from "@/features/hiring-posts/search-config";
import { getHiringPostPageData } from "@/features/hiring-posts/service";
import { hiringPostCompanyCount } from "@/features/hiring-posts/targets";

export const metadata: Metadata = {
  title: "Hiring signals",
  description: "Recent hiring-manager and recruiter posts matched against live career-page openings.",
  robots: { index: false, follow: false },
};

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link aria-label="Back to openings" className="flex items-center" href="/">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
            <Icon name="lock" className="h-4 w-4 text-sky-700 dark:text-sky-400" /> No LinkedIn login required
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function LockedSignals({ configured }: { configured: boolean }) {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-950 dark:text-slate-50">
      <SiteHeader />

      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="card px-6 py-8 sm:px-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            <Icon name="lock" className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-slate-950 dark:text-slate-50 sm:text-3xl">
            Hiring signals are private
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-400">
            This feed holds posts written by identifiable people, along with their
            names, photos and profile links. It is never served publicly.
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {configured
              ? "Open /api/hiring-posts/unlock?key=… with your HIRING_POSTS_VIEW_KEY to unlock this browser."
              : "Set HIRING_POSTS_VIEW_KEY in your environment to enable access, then unlock this browser at /api/hiring-posts/unlock?key=…"}
          </p>
          <Link className="btn btn-secondary mt-7 !min-h-10 !px-4 !text-sm" href="/">
            Back to openings
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function HiringPostsPage() {
  await connection();

  // Read the gate before the feed: a locked visitor must never cause the
  // identifiable data to be fetched, let alone rendered.
  if (!await isHiringPostsViewer()) {
    return <LockedSignals configured={isHiringPostsViewingConfigured()} />;
  }

  const data = await getHiringPostPageData();
  const technicalCount = data.feed.posts.filter((post) => post.roleFamily === "Technical").length;
  const nonTechnicalCount = data.feed.posts.length - technicalCount;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-950 dark:text-slate-50">
      <SiteHeader />

      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">Hiring signals</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950 dark:text-slate-50 sm:text-4xl">
              Posts from hiring teams, recruiters and employees.
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
            <span className="card inline-flex items-center gap-2 px-3 py-2">
              <Icon name="layers" className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {data.feed.posts.length} signals
            </span>
            <span className="card inline-flex items-center gap-2 px-3 py-2">
              <Icon name="code" className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" /> {technicalCount} technical
            </span>
            <span className="card inline-flex items-center gap-2 px-3 py-2">
              <Icon name="users" className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> {nonTechnicalCount} non-tech
            </span>
            <span className="card inline-flex items-center gap-2 px-3 py-2">
              <Icon name="refresh" className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> {hiringPostScanCadenceHours}h batch
            </span>
          </div>
        </section>

        <HiringPostDashboard
          configured={data.configured}
          error={data.error}
          posts={data.feed.posts}
          renderedAt={new Date().toISOString()}
          scanCadenceHours={hiringPostScanCadenceHours}
          companyCycleHours={hiringPostCompanyCycleHours}
          source={data.source}
          trackedCompanyCount={hiringPostCompanyCount}
          updatedAt={data.feed.updatedAt}
        />
      </div>
    </main>
  );
}
