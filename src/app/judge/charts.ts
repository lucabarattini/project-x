import { escapeHtml as escape } from "@/features/outreach/session";

// Inline SVG drawn on the server: the report needs no chart library and no client code.
export const colors = { tech: "#2a78d6", "non-tech": "#eb6834", neither: "#1baf7a" };
const ink = "#0b0b0b";
const muted = "#52514e";
const grid = "#e6e5e0";
const surface = "#fcfcfb";
const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export const chartStyles = `<style>.viz{display:block;max-width:100%;height:auto;margin:8px 0 4px}.viz text{font:12px system-ui,sans-serif;fill:${muted}}.viz .strong{fill:${ink};font-weight:600}.legend{display:flex;gap:16px;margin:6px 0;font-size:12px;color:${muted}}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}h2+p{margin:2px 0 6px;color:${muted}}section{margin:30px 0}</style>`;

const svg = (width: number, height: number, body: string) =>
  `<svg class="viz" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${body}</svg>`;

export const legend = (items: Array<[string, string]>) =>
  `<div class="legend">${items.map(([name, color]) => `<span><i style="background:${color}"></i>${escape(name)}</span>`).join("")}</div>`;

export const waiting = (message: string) => `<p><small>Waiting for data: ${escape(message)}</small></p>`;

/** A round axis top that splits into four clean ticks, at or above the highest value. */
function niceMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  return ([1, 2, 4, 6, 8, 10].find((multiple) => multiple * step >= value) ?? 10) * step;
}

/** 95% Wilson interval: honest for small samples, where plus-or-minus would leave 0 to 1. */
export function wilson(successes: number, trials: number) {
  if (trials === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const share = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (share + (z * z) / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((share * (1 - share)) / trials + (z * z) / (4 * trials * trials));
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

const rightRounded = (x: number, y: number, width: number, height: number) => {
  const r = Math.min(4, width);
  return `M${x},${y}h${width - r}a${r},${r} 0 0 1 ${r},${r}v${height - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${width - r}z`;
};

const topRounded = (x: number, y: number, width: number, height: number) => {
  const r = Math.min(4, height, width / 2);
  return `M${x},${y + height}v-${height - r}a${r},${r} 0 0 1 ${r},-${r}h${width - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${height - r}z`;
};

export function horizontalBars(
  items: Array<{ label: string; value: number; color: string; text?: string }>,
  max = Math.max(...items.map((item) => item.value)),
) {
  const labelWidth = 240;
  const plot = 420;
  const rowHeight = 26;
  const body = items.map(({ label, value, color, text }, index) => {
    const y = index * rowHeight;
    const width = Math.max(2, (value / max) * plot);
    const shown = text ?? value.toLocaleString("en-US");
    return `<g><title>${escape(label)}: ${escape(shown)}</title>
<text x="${labelWidth - 10}" y="${y + 16}" text-anchor="end">${escape(label)}</text>
<path d="${rightRounded(labelWidth, y + 5, width, 16)}" fill="${color}"/>
<text class="strong" x="${labelWidth + width + 6}" y="${y + 17}">${escape(shown)}</text></g>`;
  }).join("");
  return svg(labelWidth + plot + 90, items.length * rowHeight + 4, body);
}

export function stackedColumns(
  columns: Array<{ label: string; parts: Array<{ name: string; value: number; color: string }> }>,
) {
  const left = 44;
  const height = 210;
  const bottom = 24;
  const slot = 46;
  const top = niceMax(Math.max(...columns.map(({ parts }) => parts.reduce((sum, part) => sum + part.value, 0))));
  const scale = (height - bottom - 6) / top;
  const lines = [0, 0.25, 0.5, 0.75, 1].map((share) => {
    const y = height - bottom - share * top * scale;
    return `<line x1="${left}" x2="${left + columns.length * slot}" y1="${y}" y2="${y}" stroke="${grid}"/>
<text x="${left - 8}" y="${y + 4}" text-anchor="end">${Math.round(share * top)}</text>`;
  }).join("");
  const marks = columns.map(({ label, parts }, index) => {
    const x = left + index * slot + 11;
    const visible = parts.filter((part) => part.value > 0);
    let y = height - bottom;
    const segments = visible.map((part, position) => {
      const size = Math.max(1, part.value * scale - 2);
      y -= size;
      const mark = position === visible.length - 1
        ? `<path d="${topRounded(x, y, 24, size)}" fill="${part.color}"/>`
        : `<rect x="${x}" y="${y}" width="24" height="${size}" fill="${part.color}"/>`;
      y -= 2;
      return mark;
    }).join("");
    const detail = parts.map((part) => `${part.name} ${part.value}`).join(", ");
    return `<g><title>${escape(label)}: ${escape(detail)}</title>${segments}
<text x="${x + 12}" y="${height - 8}" text-anchor="middle">${escape(label)}</text></g>`;
  }).join("");
  return svg(left + columns.length * slot + 8, height, lines + marks);
}

export function heatmap(rows: string[], columns: string[], cells: number[][]) {
  const labelWidth = 230;
  const cellWidth = 150;
  const cellHeight = 46;
  const header = columns.map((column, index) =>
    `<text class="strong" x="${labelWidth + index * cellWidth + cellWidth / 2}" y="14" text-anchor="middle">${escape(column)}</text>`).join("");
  const body = rows.map((row, rowIndex) => {
    const total = cells[rowIndex].reduce((sum, value) => sum + value, 0);
    const y = 22 + rowIndex * cellHeight;
    return `<text x="${labelWidth - 10}" y="${y + 27}" text-anchor="end">${escape(row)}</text>` + columns.map((column, index) => {
      const value = cells[rowIndex][index];
      const share = total ? value / total : 0;
      const step = Math.min(ramp.length - 1, Math.floor(share * ramp.length));
      const x = labelWidth + index * cellWidth;
      const text = step >= 3 ? "#ffffff" : ink;
      return `<g><title>${escape(row)}, judge said ${escape(column)}: ${value} (${Math.round(share * 100)}%)</title>
<rect x="${x + 1}" y="${y + 1}" width="${cellWidth - 2}" height="${cellHeight - 2}" rx="4" fill="${ramp[step]}"/>
<text x="${x + cellWidth / 2}" y="${y + 28}" text-anchor="middle" style="fill:${text};font-weight:600">${value.toLocaleString("en-US")} · ${Math.round(share * 100)}%</text></g>`;
    }).join("");
  }).join("");
  return svg(labelWidth + columns.length * cellWidth + 4, 24 + rows.length * cellHeight, header + body);
}

/** A share per row with its 95% interval, against one reference share. */
export function intervals(
  items: Array<{ label: string; value: number; low: number; high: number; note: string }>,
  reference?: { value: number; label: string },
) {
  const labelWidth = 190;
  const plot = 440;
  const rowHeight = 24;
  const top = 20;
  const x = (share: number) => labelWidth + share * plot;
  const height = top + items.length * rowHeight + 18;
  const lines = [0, 0.25, 0.5, 0.75, 1].map((share) =>
    `<line x1="${x(share)}" x2="${x(share)}" y1="${top}" y2="${height - 18}" stroke="${grid}"/>
<text x="${x(share)}" y="${height - 4}" text-anchor="middle">${share * 100}%</text>`).join("");
  const marker = reference
    ? `<line x1="${x(reference.value)}" x2="${x(reference.value)}" y1="${top - 4}" y2="${height - 18}" stroke="${ink}"/>
<text class="strong" x="${x(reference.value)}" y="11" text-anchor="middle">${escape(reference.label)}</text>`
    : "";
  const marks = items.map(({ label, value, low, high, note }, index) => {
    const y = top + index * rowHeight + 12;
    return `<g><title>${escape(label)}: ${Math.round(value * 100)}% (95% interval ${Math.round(low * 100)} to ${Math.round(high * 100)}%), ${escape(note)}</title>
<text x="${labelWidth - 10}" y="${y + 4}" text-anchor="end">${escape(label)}</text>
<line x1="${x(low)}" x2="${x(high)}" y1="${y}" y2="${y}" stroke="${colors.tech}" stroke-width="2"/>
<circle cx="${x(value)}" cy="${y}" r="5" fill="${colors.tech}" stroke="${surface}" stroke-width="2"/>
<text x="${labelWidth + plot + 12}" y="${y + 4}">${escape(note)}</text></g>`;
  }).join("");
  return svg(labelWidth + plot + 80, height, lines + marker + marks);
}
