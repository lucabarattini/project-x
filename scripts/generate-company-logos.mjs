import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import * as icons from "simple-icons";
import branding from "../data/company-branding.json" with { type: "json" };

const outputDir = path.join(process.cwd(), "public", "company-logos");
const manualLogoDir = path.join(outputDir, "manual");
const sourceManifestPath = path.join(process.cwd(), "data", "company-logo-sources.json");

const iconOverrides = {
  "Together AI": null,
  "World Labs": null,
  "Black Forest Labs": null,
  "Jane Street": null,
  "Optiver": null,
  "IMC": null,
  "Baseten": null,
  "Cognition": null,
  "Cohere": null,
  "Crusoe": null,
  "Decagon": null,
  "EliseAI": null,
  "Glean": null,
  "Harvey": null,
  "HeyGen": null,
  "Lovable": null,
  "Physical Intelligence": null,
  "Sierra": null,
  "Virtu Financial": null,
  "Voleon": null,
  "TCS": "siTata",
};

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function initials(company) {
  const words = company
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(ai|co|io|inc|llc|ltd)$/i.test(word));

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function findIcon(company) {
  const override = iconOverrides[company];
  if (override === null) {
    return null;
  }

  if (override && icons[override]) {
    return icons[override];
  }

  const target = normalize(company.replace(/\bAI\b/gi, ""));
  return (
    Object.values(icons).find((icon) => normalize(icon.title) === target) ?? null
  );
}

function fallbackSvg(company) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="28" fill="#0f172a"/>
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" fill="white">
        ${initials(company)}
      </text>
    </svg>
  `;
}

function iconSvg(icon) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="28" fill="white"/>
      <svg x="30" y="30" width="100" height="100" viewBox="0 0 24 24">
        <path fill="#${icon.hex}" d="${icon.path}"/>
      </svg>
    </svg>
  `;
}

async function fetchFavicon(domain) {
  if (!domain) {
    return null;
  }

  const normalizedDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/u, "");
  const directIcon = await fetchOfficialIcon(normalizedDomain);

  if (directIcon) {
    return directIcon;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain_url=https://${encodeURIComponent(normalizedDomain)}&sz=128`;
  const response = await fetch(faviconUrl, {
    headers: {
      "user-agent": "ProjectXLogoFetcher/1.0",
    },
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image")) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 120 || !await canDecodeImage(buffer)) {
    return null;
  }

  return buffer;
}

async function fetchOfficialIcon(domain) {
  const homeUrl = `https://www.${domain}`;
  const response = await fetch(homeUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 ProjectXLogoFetcher/1.0",
    },
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const html = await response.text();
  const iconLinks = [
    ...html.matchAll(/<link\b[^>]*(?:rel=["'][^"']*(?:apple-touch-icon|shortcut icon|icon)[^"']*["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["'][^"']*(?:apple-touch-icon|shortcut icon|icon)[^"']*["'])[^>]*>/giu),
  ]
    .map((match) => match[1] ?? match[2])
    .filter(Boolean);

  for (const iconLink of iconLinks) {
    const iconUrl = new URL(iconLink, response.url).toString();
    const iconResponse = await fetch(iconUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 ProjectXLogoFetcher/1.0",
      },
    }).catch(() => null);

    if (!iconResponse?.ok) {
      continue;
    }

    const contentType = iconResponse.headers.get("content-type") ?? "";
    if (!contentType.includes("image")) {
      continue;
    }

    const buffer = Buffer.from(await iconResponse.arrayBuffer());
    if (buffer.length >= 120 && await canDecodeImage(buffer)) {
      return buffer;
    }
  }

  return null;
}

async function canDecodeImage(buffer) {
  try {
    await sharp(buffer).metadata();
    return true;
  } catch {
    return false;
  }
}

async function faviconPng(buffer) {
  return sharp(buffer)
    .resize(128, 128, { fit: "contain", background: "#ffffff" })
    .extend({
      top: 16,
      bottom: 16,
      left: 16,
      right: 16,
      background: "#ffffff",
    })
    .png()
    .toBuffer();
}

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(manualLogoDir, { recursive: true });

const requestedCompany = process.argv.slice(2).join(" ").trim();
const brandingEntries = Object.entries(branding).filter(
  ([company]) => !requestedCompany || company === requestedCompany,
);

if (brandingEntries.length === 0) {
  throw new Error(`Unknown company: ${requestedCompany}`);
}

const sources = requestedCompany
  ? JSON.parse(await fs.readFile(sourceManifestPath, "utf8"))
  : {};

for (const [company, meta] of brandingEntries) {
  const icon = findIcon(company);
  const target = path.join(process.cwd(), "public", meta.logoPath);
  const manualTarget = path.join(manualLogoDir, path.basename(meta.logoPath));

  try {
    await fs.access(manualTarget);
    await sharp(manualTarget)
      .resize(160, 160, { fit: "contain", background: "#ffffff" })
      .png()
      .toFile(target);
    sources[company] = {
      source: "manual",
      domain: meta.domain,
      logoPath: meta.logoPath,
      manualPath: `/company-logos/manual/${path.basename(meta.logoPath)}`,
    };
    console.log(`manual ${company} -> ${meta.logoPath}`);
    continue;
  } catch {
    // No manual override for this company.
  }

  if (company === "Google" && meta.logoPath.endsWith(".svg")) {
    await fs.access(target);
    sources[company] = {
      source: "official-gstatic",
      title: "Google multicolor G",
      domain: meta.domain,
      logoPath: meta.logoPath,
    };
    console.log(`official ${company} -> ${meta.logoPath}`);
    continue;
  }

  if (icon) {
    await sharp(Buffer.from(iconSvg(icon))).png().toFile(target);
    sources[company] = {
      source: "simple-icons",
      title: icon.title,
      domain: meta.domain,
      logoPath: meta.logoPath,
    };
    console.log(`icon ${company} -> ${meta.logoPath}`);
    continue;
  }

  const favicon = await fetchFavicon(meta.domain).catch(() => null);

  if (favicon) {
    await fs.writeFile(target, await faviconPng(favicon));
    sources[company] = {
      source: "favicon",
      domain: meta.domain,
      logoPath: meta.logoPath,
    };
    console.log(`favicon ${company} -> ${meta.logoPath}`);
    continue;
  }

  await sharp(Buffer.from(fallbackSvg(company))).png().toFile(target);
  sources[company] = {
    source: "fallback",
    domain: meta.domain,
    logoPath: meta.logoPath,
  };
  console.log(`fallback ${company} -> ${meta.logoPath}`);
}

await fs.writeFile(sourceManifestPath, `${JSON.stringify(sources, null, 2)}\n`);
