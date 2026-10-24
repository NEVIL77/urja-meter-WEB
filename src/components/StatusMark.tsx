import type { Status } from '../api';

export const STATUSES = ['installed', 'faulty', 'decommissioned'] as const satisfies readonly Status[];

export const statusColor = (s: Status) => `var(--${s === 'decommissioned' ? 'off' : s})`;

// One drawing per status, used everywhere a status appears: the map, the filters,
// the legend and the meter panel. The glyph carries the meaning on its own
// (check, warning sign, power off), so status never depends on colour alone.
const GLYPH = 'fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round';
const ICONS: Record<Status, (edge: string) => string> = {
  installed: (edge) =>
    `<circle cx="12" cy="12" r="10" style="fill:var(--installed);${edge}"/>` +
    `<path d="M7.3 12.4l3.2 3.2 6.2-6.6" style="${GLYPH}"/>`,
  faulty: (edge) =>
    `<path d="M10.2 3.4a2.1 2.1 0 0 1 3.6 0l8.4 14.6a2.1 2.1 0 0 1-1.8 3.1H3.6a2.1 2.1 0 0 1-1.8-3.1Z" style="fill:var(--faulty);${edge}"/>` +
    `<path d="M12 9v4.6" style="${GLYPH}"/><circle cx="12" cy="17" r="1.45" style="fill:#fff"/>`,
  decommissioned: (edge) =>
    `<circle cx="12" cy="12" r="10" style="fill:var(--off);${edge}"/>` +
    `<path d="M8.6 8.7a4.8 4.8 0 1 0 6.8 0M12 6.5v5" style="${GLYPH};stroke-width:2.1"/>`,
};

/**
 * The status icon as SVG markup. Leaflet markers need a string, so this is the
 * one source for the React component too. `ring` draws a 2px edge: the surface
 * colour keeps overlapping map markers apart, ink marks the selected one.
 */
export function statusSvg(status: Status, size: number, ring?: 'surface' | 'selected'): string {
  const edge =
    ring === 'selected'
      ? 'stroke:var(--ink);stroke-width:5;paint-order:stroke'
      : ring === 'surface'
        ? 'stroke:var(--surface);stroke-width:4;paint-order:stroke'
        : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;overflow:visible" aria-hidden="true">${ICONS[status](edge)}</svg>`;
}

export function StatusMark({ status, size = 16 }: { status: Status; size?: number }) {
  // Static markup from the table above; no data from the API goes into it.
  return <span className="status-mark" dangerouslySetInnerHTML={{ __html: statusSvg(status, size) }} />;
}

/** Installed, faulty and decommissioned as one bar, with 2px gaps between segments. */
export function ShareBar({ counts, className }: { counts: Record<Status, number>; className: string }) {
  const title = STATUSES.map((s) => `${counts[s]} ${s}`).join(' · ');
  return (
    <div className={className} title={title} role="img" aria-label={title}>
      {STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} style={{ flexGrow: counts[s], background: statusColor(s) }} />
      ))}
    </div>
  );
}
