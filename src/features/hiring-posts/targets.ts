import amazonBoards from "../../../data/amazon-boards.json";
import ashbyBoards from "../../../data/ashby-boards.json";
import customCareerBoards from "../../../data/custom-careers-boards.json";
import googleBoards from "../../../data/google-boards.json";
import greenhouseBoards from "../../../data/greenhouse-boards.json";
import leverBoards from "../../../data/lever-boards.json";
import workdayBoards from "../../../data/workday-boards.json";

type HiringBoard = {
  company: string;
  token?: string;
  boardUrl?: string;
  apiUrl?: string;
};

const boards: HiringBoard[] = [
  ...amazonBoards,
  ...ashbyBoards,
  ...customCareerBoards,
  ...googleBoards,
  ...greenhouseBoards,
  ...leverBoards,
  ...workdayBoards,
];

export function normalizeCompanyComparable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export const hiringPostCompanies = [...new Set(boards.map((board) => board.company))]
  .sort((left, right) => left.localeCompare(right));

const boardsBySpecificity = [...boards].sort((left, right) => {
  const leftLength = Math.max(left.boardUrl?.length ?? 0, left.apiUrl?.length ?? 0);
  const rightLength = Math.max(right.boardUrl?.length ?? 0, right.apiUrl?.length ?? 0);
  return rightLength - leftLength;
});

function hasUrlPrefix(value: URL, candidate: string | undefined) {
  if (!candidate) return false;
  try {
    const base = new URL(candidate);
    const basePath = base.pathname.replace(/\/$/u, "");
    return value.hostname === base.hostname
      && (!basePath || basePath === "/" || value.pathname.startsWith(basePath));
  } catch {
    return false;
  }
}

export function companyFromHiringUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "amazon.jobs" || url.hostname.endsWith(".amazon.jobs")) {
      return "Amazon";
    }
    if ((url.hostname === "google.com" || url.hostname.endsWith(".google.com"))
      && url.pathname.includes("/about/careers/")) {
      return "Google";
    }

    return boardsBySpecificity.find((board) => (
      hasUrlPrefix(url, board.boardUrl) || hasUrlPrefix(url, board.apiUrl)
    ))?.company ?? null;
  } catch {
    return null;
  }
}

export function isKnownHiringUrl(value: string) {
  return companyFromHiringUrl(value) !== null;
}

const companyTerms = hiringPostCompanies
  .map((company) => ({ company, term: normalizeCompanyComparable(company) }))
  .filter(({ term }) => term.length >= 3)
  .sort((left, right) => right.term.length - left.term.length);

const companyAliases = new Map<string, string>([
  ["amazon web services", "Amazon"],
  ["aws", "Amazon"],
  ["google cloud", "Google"],
  ["open ai", "OpenAI"],
  ["sig", "Susquehanna International Group"],
]);

export function companyMentionInText(value: string) {
  const comparable = ` ${normalizeCompanyComparable(value)} `;
  for (const [alias, company] of companyAliases) {
    if (comparable.includes(` ${alias} `)) return company;
  }
  return companyTerms.find(({ term }) => comparable.includes(` ${term} `))?.company ?? null;
}

export function withoutFormerCompanyMentions(value: string) {
  let comparable = ` ${normalizeCompanyComparable(value)} `;
  const formerTerms = [...new Set([
    ...companyTerms.map(({ term }) => term),
    ...companyAliases.keys(),
  ])];
  for (const term of formerTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    comparable = comparable.replace(
      new RegExp(`\\b(?:ex|former|formerly at|previously at)\\s+${escaped}\\b`, "gu"),
      " ",
    );
  }
  return comparable.replace(/\s+/gu, " ").trim();
}

export const hiringPostCompanyCount = hiringPostCompanies.length;
