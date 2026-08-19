import { fetchLatestGoogleJobs, googleBoards } from "../src/features/jobs/providers/google";

async function main() {
  const endpoint = googleBoards[0].apiUrl;
  const jobs = await fetchLatestGoogleJobs({ maxJobs: 2500, maxPages: 130 });
  const datedJobs = jobs.filter((job) => job.postedAt);

  if (jobs.length === 0 || datedJobs.length !== jobs.length) {
    throw new Error(
      `Expected a raw publish timestamp for every Google result; found ${datedJobs.length}/${jobs.length}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        endpoint,
        rawSource: "AF_initDataCallback class=ds:1",
        rawPublishField: "data[0][job row][12] as [epoch seconds, nanoseconds]",
        rawUpdateField: "data[0][job row][13] as [epoch seconds, nanoseconds]",
        jobs: jobs.length,
        jobsWithPublishedAt: datedJobs.length,
        samples: datedJobs.slice(0, 5).map((job) => ({
          id: job.id,
          title: job.title,
          postedAt: job.postedAt,
          updatedAt: job.updatedAt,
          url: job.absoluteUrl,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
