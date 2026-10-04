/**
 * Saved searches: a careers-site search URL, kept exactly as built on that
 * site. Stripe's and Apple's own boards never say when a role was posted;
 * resolving the same search here shows those roles with their posting date
 * and experience line. The site answers which postings match. Stripe's are
 * matched to the snapshot on the Greenhouse id both share; Apple's search
 * pages already carry the posting date, so its rows are built from them.
 */
export type SearchPreset = {
  id: string;
  label: string;
  company: string;
  site: "stripe" | "apple";
  url: string;
};

export const searchPresets: SearchPreset[] = [
  {
    id: "stripe-gemma",
    label: "Stripe · Seattle (Gemma)",
    company: "Stripe",
    site: "stripe",
    url: "https://stripe.com/careers/search?teams=Administrative&teams=Corporate+Development&teams=Finance&teams=Global+Partnerships&teams=Go-to-Market&teams=People&teams=Products&teams=Risk+%26+Financial+Crimes&locations=North+America--United+States--Seattle&employment_types=Full+time",
  },
  {
    id: "apple-gemma",
    label: "Apple · Seattle & Bay Area (Gemma)",
    company: "Apple",
    site: "apple",
    url: "https://jobs.apple.com/en-us/search?location=united-states-USA+seattle-metro-area-SEAT+san-francisco-bay-area-SFMETRO+cupertino-CUP+seattle-SEA+washington-state1000+california-state953&team=video-media-and-audio-technologies-SFTWR-VMAT+environment-and-social-initiatives-CORSV-ENSI+finance-CORSV-FIN+global-security-CORSV-GLSEC+information-systems-and-technology-CORSV-IT+people-CORSV-HR+places-CORSV-REFAC+policy-and-government-affairs-CORSV-GOV+account-management-SLDEV-CC+advertising-sales-SLDEV-AS+apple-channel-store-sales-SLDEV-CRC+business-development-SLDEV-BUSDEV+e-commerce-SLDEV-ARS+field-engineering-SLDEV-FSE+retail-experience-and-operations-SLDEV-REO+sales-and-planning-operations-SLDEV-SO+business-process-re-engineering-CUST-BPE+business-insights-operations-and-systems-CUST-BIOS+channel-management-CUST-SCMO+supply-chain-operations-CUST-SCO+corporate-STDNT-CORP+corporate-communications-MKTG-CRPCM+developer-relations-MKTG-DR+events-and-experiences-MKTG-EE+marketing-communications-MKTG-MKTCM+product-marketing-MKTG-PM+retail-engagement-marketing-and-merchandising-MKTG-REMM+services-marketing-MKTG-SVCM",
  },
];

export function findPreset(id: string | null) {
  return searchPresets.find((preset) => preset.id === id) ?? null;
}
