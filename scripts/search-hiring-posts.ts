import { loadEnvConfig } from "@next/env";
import {
  readHiringPostFeed,
  runPostSearchActor,
  writeHiringPostFeed,
} from "../src/features/hiring-posts/apify-client";
import { enrichJobLinks } from "../src/features/hiring-posts/enrichment";
import { mergeHiringPostFeed } from "../src/features/hiring-posts/feed";
import { normalizeHiringPosts } from "../src/features/hiring-posts/normalize";
import {
  buildTargetedPostSearchInput,
  isTargetedSearchQueryFamily,
  targetedSearchQueryFamilies,
  targetedSearchResultCeiling,
  targetedSearchTitleMatcher,
  untrackedCompanies,
} from "../src/features/hiring-posts/targeted-search";
import type {
  TargetedSearchQueryFamily,
  TargetedSearchWindow,
} from "../src/features/hiring-posts/targeted-search";
import type { ApifyLinkedinPost } from "../src/features/hiring-posts/types";

/** Apify's pay-per-result price for this Actor, for the pre-flight estimate. */
const usdPerResult = 0.002;

function flag(name: string) {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match?.slice(name.length + 3);
}

function main() {
  loadEnvConfig(process.cwd());

  const companies = (flag("companies") ?? "DoorDash,Anthropic,Amazon")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const postedLimit = (flag("window") ?? "week") as TargetedSearchWindow;
  const maxPosts = Number(flag("max-posts") ?? 25);
  const commit = process.argv.includes("--commit");
  // Reporting is for companies the feed does not track. Their posts would be
  // billed and then dropped at normalization, so print them instead of merging.
  const report = process.argv.includes("--report");

  // --query= is the escape hatch for a phrasing no family covers yet; one flag
  // is one query, and repeating it adds families (and multiplies the bill).
  const rawQueries = process.argv
    .filter((value) => value.startsWith("--query="))
    .map((value) => value.slice("--query=".length))
    .filter(Boolean);
  const familyName = flag("queries") ?? "outreach";
  if (rawQueries.length === 0 && !isTargetedSearchQueryFamily(familyName)) {
    throw new Error(
      `Unknown query family "${familyName}". Known: ${Object.keys(targetedSearchQueryFamilies).join(", ")}`,
    );
  }
  // A custom --query= belongs to no family, so its report highlights every
  // discipline rather than pretending to know which one was asked for.
  const family = rawQueries.length > 0 ? null : familyName as TargetedSearchQueryFamily;
  const queries = rawQueries.length > 0 ? rawQueries : targetedSearchQueryFamilies[family!];

  const input = buildTargetedPostSearchInput({ companies, queries, postedLimit, maxPosts });
  const ceiling = targetedSearchResultCeiling(input.searchQueries.length, input.maxPosts);
  const untracked = untrackedCompanies(companies);

  console.log(`Companies : ${companies.join(", ")}`);
  console.log(`Queries   : ${input.searchQueries.length} × ${rawQueries.length > 0 ? "custom" : familyName}`);
  for (const query of input.searchQueries) console.log(`          · ${query}`);
  console.log(`Window    : ${input.postedLimit} · maxPosts ${input.maxPosts} per query`);
  console.log(`Ceiling   : ${ceiling} results ≈ $${(ceiling * usdPerResult).toFixed(2)} worst case`);
  if (untracked.length > 0 && !report) {
    console.log(
      `\n⚠ Not target companies, their posts are dropped at ingest: ${untracked.join(", ")}`,
    );
    console.log("  Add --report to print the results instead of ingesting them.");
  }
  if (!commit) {
    console.log("\nDry run. Re-run with --commit to spend the above and ingest the results.");
    return;
  }
  return report ? runReport(input, family) : run(input, family);
}

async function runReport(
  input: ReturnType<typeof buildTargetedPostSearchInput>,
  family: TargetedSearchQueryFamily | null,
) {
  console.log("\nRunning the Actor (report only — nothing is written to the feed)…");
  const rawPosts = await runPostSearchActor(input) as ApifyLinkedinPost[];
  console.log(`Actor returned ${rawPosts.length} posts ≈ $${(rawPosts.length * usdPerResult).toFixed(2)}\n`);

  const seen = new Set<string>();
  const rows = rawPosts
    .filter((post) => {
      const key = post.linkedinUrl ?? post.id ?? "";
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((post) => {
      const text = (post.content ?? "").replace(/\s+/gu, " ").trim();
      const matcher = targetedSearchTitleMatcher(family);
      const titles = [...new Set((text.match(matcher) ?? []).map((title) => title.toLowerCase()))];
      return { post, text, titles };
    })
    // A post naming a role title is the whole point; the rest is context.
    .sort((left, right) => right.titles.length - left.titles.length);

  for (const { post, text, titles } of rows) {
    console.log("=".repeat(78));
    console.log(`${post.author?.name ?? "—"}${titles.length > 0 ? `  →  ${titles.join(", ")}` : ""}`);
    console.log(`  ${post.author?.info ?? "—"}`);
    console.log(`  ${post.postedAt?.date?.slice(0, 10) ?? "—"} · ${post.linkedinUrl ?? "—"}`);
    console.log(`  ${text.slice(0, 500)}`);
  }
  console.log("=".repeat(78));
  console.log(`${rows.length} unique posts · ${rows.filter((row) => row.titles.length > 0).length} name a role title this search was aimed at.`);
}

async function run(
  input: ReturnType<typeof buildTargetedPostSearchInput>,
  family: TargetedSearchQueryFamily | null,
) {
  console.log("\nRunning the Actor (the scheduled task is untouched)…");
  const rawPosts = await runPostSearchActor(input) as ApifyLinkedinPost[];
  console.log(`Actor returned ${rawPosts.length} posts ≈ $${(rawPosts.length * usdPerResult).toFixed(2)}`);
  if (rawPosts.length === 0) return;

  const now = new Date();
  const [stored, metadata] = await Promise.all([readHiringPostFeed(), enrichJobLinks(rawPosts)]);
  const normalized = normalizeHiringPosts(rawPosts, now, metadata);
  const next = mergeHiringPostFeed(stored, normalized, {
    runId: `targeted-${Date.now()}`,
    rawCount: rawPosts.length,
    now,
  });
  if (next === stored) {
    console.log("Every post was already in the feed — nothing written.");
    return;
  }
  await writeHiringPostFeed(next);
  console.log(`Feed ${stored.posts.length} → ${next.posts.length} posts.`);

  // An ingesting run is still a run someone is reading: a name and a URL alone
  // send you to LinkedIn to find out whether the post was worth opening, which
  // is the whole job the report already does.
  const fresh = next.posts.filter((post) => !stored.posts.some((old) => old.id === post.id));
  console.log(`\n${fresh.length} new:`);
  for (const post of fresh) {
    const text = post.content.replace(/\s+/gu, " ").trim();
    const titles = [...new Set(
      (text.match(targetedSearchTitleMatcher(family)) ?? []).map((title) => title.toLowerCase()),
    )];
    console.log("=".repeat(78));
    console.log(`${post.author.name}${titles.length > 0 ? `  →  ${titles.join(", ")}` : ""}`);
    console.log(`  ${post.author.headline || "—"}`);
    console.log(`  [${post.company}/${post.roleFamily}/${post.matchStatus}] ${post.location.label}`);
    console.log(`  ${post.postedAt.slice(0, 10)} · ${post.linkedinUrl}`);
    console.log(`  ${text.slice(0, 500)}`);
  }
}

Promise.resolve(main()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
