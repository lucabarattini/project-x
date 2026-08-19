import boards from "../data/greenhouse-boards.json" with { type: "json" };

const boardArg = process.argv[2];
const requestedBoard = boardArg
  ? boards.find(
      (board) =>
        board.token.toLowerCase() === boardArg.toLowerCase() ||
        board.company.toLowerCase() === boardArg.toLowerCase(),
    )
  : null;

const candidateBoards = requestedBoard ? [requestedBoard] : boards;

function parsePublishedAtFromEmbed(html) {
  const match = html.match(/"published_at"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function parseDatePostedFromJsonLd(html) {
  const matches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (typeof parsed.datePosted === "string") {
        return parsed.datePosted;
      }
    } catch {
      // Ignore non-JSON script bodies.
    }
  }

  return null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "project-x-posted-date-verifier" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "project-x-posted-date-verifier" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  for (const board of candidateBoards) {
    const data = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=false`,
    );
    const job = data.jobs?.find((item) => item.first_published);

    if (!job) {
      continue;
    }

    const embedUrl = `https://job-boards.greenhouse.io/embed/job_app?for=${board.token}&token=${job.id}`;
    const embedHtml = await fetchText(embedUrl);
    const embedPublishedAt = parsePublishedAtFromEmbed(embedHtml);

    let jsonLdDatePosted = null;
    try {
      const jobHtml = await fetchText(job.absolute_url);
      jsonLdDatePosted = parseDatePostedFromJsonLd(jobHtml);
    } catch {
      // Many new Greenhouse custom pages do not expose JSON-LD or block direct HTML fetches.
    }

    console.log(
      JSON.stringify(
        {
          company: board.company,
          boardToken: board.token,
          jobId: job.id,
          title: job.title,
          url: job.absolute_url,
          boardsApiFirstPublished: job.first_published ?? null,
          embedPublishedAt,
          jsonLdDatePosted,
          boardsApiMatchesEmbed: job.first_published === embedPublishedAt,
          boardApiEndpoint: `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=false`,
          embedEndpoint: embedUrl,
        },
        null,
        2,
      ),
    );

    return;
  }

  throw new Error("No Greenhouse job with first_published found.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
