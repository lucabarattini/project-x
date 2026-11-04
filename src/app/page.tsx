import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/Brand";
import { JobDashboard } from "@/features/jobs/dashboard/JobDashboard";
import { jobBoards } from "@/features/jobs/service";

export const metadata: Metadata = {
  title: "Live openings from company career pages",
  description:
    "Fresh technical and business roles pulled directly from company career pages, with auditable publication dates and experience requirements.",
};

/** Static: the board loads in the browser, so opening this page runs nothing on the server. */
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <a className="skip-link" href="#openings">Skip to jobs</a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link aria-label="Home" className="flex items-center" href="/">
            <BrandLogo />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            <a className="btn btn-ghost !min-h-10 !px-3 !text-sm" href="/outreach">
              Outreach
            </a>
          </nav>
        </div>
      </header>
      <JobDashboard
        boards={jobBoards.map(({ company, token, source, boardUrl }) => ({ company, token, source, boardUrl }))}
      />
      <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10">
        <p className="border-t border-slate-200 py-6 text-xs leading-5 text-slate-500">
          This site is not affiliated with or endorsed by LinkedIn or any of the listed companies.
          Data is fetched directly from official ATS career pages.
        </p>
      </footer>
    </main>
  );
}
