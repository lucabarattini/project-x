# Company logos

## Manual override path

Put manually downloaded logos here:

```txt
public/company-logos/manual/
```

Use the exact filename from `data/company-branding.json` / `logoPath`.

Examples:

| Company | Manual file path |
| --- | --- |
| Amazon | `public/company-logos/manual/amazon.png` |
| Clay | `public/company-logos/manual/clay.png` |
| Safe Superintelligence | `public/company-logos/manual/safesuperintelligence.png` |
| Thinking Machines Lab | `public/company-logos/manual/thinkingmachineslab.png` |
| Mistral AI | `public/company-logos/manual/mistralai.png` |

Then run:

```sh
npm run generate:logos
```

The script resizes the manual image to the app's 160x160 PNG format and copies it to:

```txt
public/company-logos/{filename}.png
```

Manual logos win over all generated sources and are recorded as `source: "manual"` in:

```txt
data/company-logo-sources.json
```

To regenerate a single company without refetching every logo, pass its exact
branding name:

```bash
npm run generate:logos -- "Wispr Flow"
```

The Google mark is the official multicolor G asset stored as `public/company-logos/google.svg`; the generator preserves it instead of replacing it with the monochrome Simple Icons version.

## Recommended download sources

Use these sources, in order:

1. Official company press/brand/media kit page.
2. Official website favicon or app icon if no brand kit exists.
3. Simple Icons when the company is listed there.

Avoid random logo aggregator files unless the license is clear.
