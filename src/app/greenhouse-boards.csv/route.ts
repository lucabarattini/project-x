import { jobBoards } from "@/features/jobs/service";

function escapeCsv(value: string | number) {
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const header = [
    "company",
    "token",
    "source",
    "boardUrl",
    "apiUrl",
    "lastVerifiedJobCount",
  ];

  const rows = jobBoards.map((board) =>
    [
      board.company,
      board.token,
      board.source,
      board.boardUrl,
      board.apiUrl,
      board.lastVerifiedJobCount,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return new Response([header.join(","), ...rows].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="job-boards.csv"',
    },
  });
}
