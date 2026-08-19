import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Icon } from "@/components/ui/Icon";
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
  title: "Hiring Signals · Job Radar",
  description: "Recent hiring-manager and recruiter posts matched against live career-page openings.",
  robots: { index: false, follow: false },
};

function LockedSignals({ configured }: { configured: boolean }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-sky-800" href="/">
            <Icon name="arrow-left" className="h-4 w-4" /> Job radar
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="card px-6 py-8 sm:px-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon name="lock" className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-slate-950 sm:text-3xl">
            Hiring signals are private
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            This feed holds posts written by identifiable people, along with their
            names, photos and profile links. It is never served publicly.
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            {configured
              ? "Open /api/hiring-posts/unlock?key=… with your HIRING_POSTS_VIEW_KEY to unlock this browser."
              : "Set HIRING_POSTS_VIEW_KEY in your environment to enable access, then unlock this browser at /api/hiring-posts/unlock?key=…"}
          </p>
          <Link className="btn btn-secondary mt-7 !min-h-10 !px-4 !text-sm" href="/">
            Back to the job radar
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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-sky-800" href="/">
            <Icon name="arrow-left" className="h-4 w-4" /> Job radar
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
            <Icon name="lock" className="h-4 w-4 text-sky-700" /> No LinkedIn login required
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Hiring signals</p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Hiring signals from people close to the role.
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
                Fresh posts from hiring teams, recruiters and employee shares — matched to live
                career-page openings where possible. Read the context, send a thoughtful message,
                and mark the lead handled.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
              <div className="card flex min-w-[130px] items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name="layers" className="h-4 w-4" /></span>
                <div><p className="text-lg font-bold leading-5 text-slate-950">{data.feed.posts.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Signals</p></div>
              </div>
              <div className="card flex min-w-[130px] items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon name="code" className="h-4 w-4" /></span>
                <div><p className="text-lg font-bold leading-5 text-slate-950">{technicalCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Technical</p></div>
              </div>
              <div className="card flex min-w-[130px] items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="users" className="h-4 w-4" /></span>
                <div><p className="text-lg font-bold leading-5 text-slate-950">{nonTechnicalCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Non-tech</p></div>
              </div>
              <div className="card flex min-w-[130px] items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon name="clock" className="h-4 w-4" /></span>
                <div><p className="text-lg font-bold leading-5 text-slate-950">{hiringPostScanCadenceHours}h</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Batch</p></div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <ol className="flex flex-col gap-3 text-sm leading-6 text-slate-700 sm:flex-row sm:gap-8">
              {[
                ["Start with the first unhandled lead", "radar"],
                ["Reference the post when you message", "sparkle"],
                ["Mark it contacted — the next scans arrive automatically", "check"],
              ].map(([step, icon], index) => (
                <li className="flex items-start gap-2.5" key={step}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[11px] font-bold text-sky-700">{index + 1}</span>
                  <span><Icon name={icon as never} className="mr-1 inline h-3.5 w-3.5 text-slate-400" />{step}</span>
                </li>
              ))}
            </ol>
            <p className="shrink-0 text-xs font-semibold text-slate-500">
              {hiringPostCompanyCount} companies · all scanned every {hiringPostCompanyCycleHours}h
            </p>
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
