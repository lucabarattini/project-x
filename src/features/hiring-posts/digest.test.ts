import assert from "node:assert/strict";
import test from "node:test";
import { serialDigestExclusionReason, serialDigestSignals } from "./digest";

/** The template that took 8 of 34 results in one run, trimmed to two rows. */
const dailyDigest = [
  "🚀 Amazon is Hiring! | August 29, 2026 (Part 5/5)",
  "Fresh roles posted in the last 24 hours 👇",
  "💼 Delivery Consultant, WWPS ProServe 📍 St. Louis, Missouri 🔗 https://lnkd.in/gctS3GkG",
  "💼 Account Manager, SMB Ramping 📍 Austin, Texas 🔗 https://lnkd.in/gSqvmpN6",
  "♻️ Repost to help someone in your network!",
  "🔔 Follow for daily Amazon job updates.",
].join(" ");

test("flags the shortest instalment of a numbered daily digest", () => {
  // Two roles is the smallest part the series publishes. Catching only the
  // eight-role instalments would leave the short ones in the feed, which is
  // the worst of both outcomes.
  const reason = serialDigestExclusionReason(
    "🚀 Amazon is Hiring! | August 29, 2026 (Part 5/5)",
    dailyDigest,
    "employee-share",
  );
  assert.ok(reason);
  assert.match(reason, /Part N\/M/u);
});

test("a series marker outranks any claim to own the roles", () => {
  // The rule has to survive an author adding "my team is hiring" to the
  // template, because nothing else about the post would have changed.
  const reason = serialDigestExclusionReason(
    "🚀 Amazon is Hiring! | August 29, 2026 (Part 5/5)",
    `${dailyDigest} My team is hiring too.`,
    "direct-team",
  );
  assert.ok(reason);
});

test("flags a bare link dump with no template at all", () => {
  const content = [
    "Amazon just posted a ton of Program Manager positions!",
    "Senior TPM, Cyber Threat Intelligence Austin, TX https://lnkd.in/eY2eP4Wr",
    "Product Manager Tech III Seattle, WA https://lnkd.in/e5WQE8Cq",
    "Sr. Global Trade Operations PM Bellevue, WA https://lnkd.in/eWx-U34f",
    "Senior Technical Product Manager Seattle, WA https://lnkd.in/ed-BzgYN",
    "Senior TPM, Global Services Nashville, TN https://lnkd.in/epPvZMy8",
  ].join(" ");
  const reason = serialDigestExclusionReason("Amazon just posted a ton of roles", content, "employee-share");
  assert.ok(reason);
  assert.match(reason, /5 job links/u);
});

test("one role advertised across three offices is one role", () => {
  // An Amazon recruiter's single Program Manager opening repeated 📍 once per
  // office and linked the role once. Counting glyphs alone read that as five
  // roles and archived a genuine lead.
  const content = [
    "🚨 AMAZON HOT JOB ALERT 🚨 Sr. Program Manager, Fleet Inspections",
    "📍 Arlington, VA 📍 Tempe, AZ 📍 Nashville, TN",
    "This is a backfill on the Fleet Experience & Compliance team.",
    "Apply: https://www.amazon.jobs/en/jobs/123/sr-program-manager",
  ].join(" ");
  const signals = serialDigestSignals("Sr. Program Manager, Fleet Inspections", content);
  assert.equal(signals.roleBullets, 3);
  assert.equal(signals.distinctLinks, 1);
  assert.equal(signals.listedRoles, 1);
  assert.equal(
    serialDigestExclusionReason("Sr. Program Manager, Fleet Inspections", content, "recruiter"),
    null,
  );
});

test("a manager linking several reqs for their own team is not a digest", () => {
  // A Meta tech lead hiring Production, Network and Software Engineers linked
  // seven reqs and owns all of them. Counting cannot separate that from an
  // aggregator with seven links, so the ownership claim decides.
  const content = [
    "Hello All! I am hiring for senior or staff level Production Engineers /",
    "Network Engineers / Software Engineers for the Data Center Network Product",
    "Design team at Meta.",
    "https://lnkd.in/a1 https://lnkd.in/a2 https://lnkd.in/a3 https://lnkd.in/a4",
    "https://lnkd.in/a5 https://lnkd.in/a6 https://lnkd.in/a7",
  ].join(" ");
  assert.equal(serialDigestExclusionReason("Hello All!", content, "direct-team"), null);
  // The same post from someone with no claim on the roles is a listing.
  assert.ok(serialDigestExclusionReason("Hello All!", content, "employee-share"));
});

test("an eight-role listing needs no marker and accepts no ownership claim", () => {
  const rows = Array.from({ length: 8 }, (_, index) => (
    `💼 Role ${index} 📍 Seattle, WA 🔗 https://lnkd.in/role${index}`
  )).join(" ");
  assert.ok(serialDigestExclusionReason("Roles", `Our team is hiring! ${rows}`, "direct-team"));
});

test("an ordinary single-role post is left alone", () => {
  const content = [
    "My team is hiring a Senior Program Manager in Seattle, WA.",
    "📍 Seattle 💼 Full time. Apply here:",
    "https://www.amazon.jobs/en/jobs/123/senior-program-manager",
  ].join(" ");
  assert.equal(serialDigestExclusionReason("Senior Program Manager", content, "direct-team"), null);
  assert.equal(serialDigestExclusionReason("Senior Program Manager", content, "employee-share"), null);
});

test("a job-alert channel post is a digest even with a single role", () => {
  // "Follow for daily updates" plus two links is the shape of a broadcast
  // account, whatever it happens to be advertising today.
  const content = [
    "🚨 FRESHER HIRING ALERT | Role: Software Engineer",
    "👉 Apply Here: https://shorturl.at/6BeAl",
    "📲 Join our WhatsApp Channel for daily job updates: https://lnkd.in/d8QKMktf",
  ].join(" ");
  const reason = serialDigestExclusionReason("FRESHER HIRING ALERT", content, "employee-share");
  assert.ok(reason);
  assert.match(reason, /daily updates/u);
});
