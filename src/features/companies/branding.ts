import branding from "../../../data/company-branding.json";

type Branding = Record<
  string,
  {
    domain: string;
    logoPath: string;
  }
>;

const companyBranding = branding as Branding;

const companyAliases: Record<string, string> = {
  amazoncom: "Amazon",
  amazonwebservices: "Amazon",
  awsamazon: "Amazon",
  claylabs: "Clay",
  googlellc: "Google",
  point72assetmanagement: "Point72",
  point72careers: "Point72",
};

function normalizeCompanyName(company: string) {
  return company.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

const normalizedCompanies = new Map(
  Object.keys(companyBranding).map((company) => [normalizeCompanyName(company), company]),
);

export function companyBrand(company: string) {
  const normalized = normalizeCompanyName(company);
  const canonicalCompany =
    companyAliases[normalized] ?? normalizedCompanies.get(normalized) ?? null;

  return canonicalCompany ? companyBranding[canonicalCompany] : null;
}

export function companyLogoPath(company: string) {
  return companyBrand(company)?.logoPath ?? null;
}

export function companyDomain(company: string) {
  return companyBrand(company)?.domain ?? null;
}
