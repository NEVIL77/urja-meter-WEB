// A small SVG chart for one series: columns or a line. Hand-built rather than a
// library so it follows the house rules exactly: 2px lines, columns capped at
// 24px with a 4px rounded end, hairline grid, crosshair tooltip, keyboard support.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmt } from '../format';

export interface Point {
  x: number;
  y: number | null;
}

interface Props {
  title: string;
  note?: string;
  points: Point[];
  kind: 'column' | 'line';
  unit: string;
  tickLabel: (x: number) => string;
  tipLabel: (x: number) => string;
  /** x positions to label on a line chart. Columns label every bar. */
  ticks?: number[];
  zeroBased?: boolean;
  area?: boolean;
  height?: number;
}

const M = { top: 18, right: 10, bottom: 24, left: 44 };

export function Chart(props: Props) {
  const { title, note, points, kind, unit, tickLabel, tipLabel, ticks = [], area, height = 170 } = props;
  const zeroBased = props.zeroBased ?? kind === 'column';
  const [ref, width] = useWidth<HTMLElement>();
  const [active, setActive] = useState<number | null>(null);
  const values = points.flatMap((p) => (p.y === null ? [] : [p.y]));

  const yTicks = values.length ? niceTicks(zeroBased ? 0 : Math.min(...values), Math.max(...values), 4) : [0, 1];
  const lo = yTicks[0]!;
  const hi = yTicks[yTicks.length - 1]!;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const x0 = points[0]?.x ?? 0;
  const x1 = points[points.length - 1]?.x ?? 0;
  const band = innerW / Math.max(1, points.length);
  const xAt = (t: number) => M.left + (x1 === x0 ? innerW / 2 : ((t - x0) / (x1 - x0)) * innerW);
  const x = (i: number) => (kind === 'column' ? M.left + band * (i + 0.5) : xAt(points[i]!.x));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (kind !== 'line') return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setActive(best);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    setActive((i) => Math.min(points.length - 1, Math.max(0, (i ?? -1) + step)));
  };

  if (values.length === 0) return null;
  const peakIndex = points.findIndex((p) => p.y === Math.max(...values));
  const current = active === null ? null : points[active]!;

  return (
    <figure className="chart" ref={ref} style={{ margin: 0 }}>
      <h4>{title}</h4>
      {note && <p className="note">{note}</p>}
      {width > 0 && (
        <svg
          height={height}
          tabIndex={0}
          role="img"
          aria-label={`${title}. ${points.length} values from ${tipLabel(x0)} to ${tipLabel(x1)}. Use the arrow keys to read them.`}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        >
          <g className="grid">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} className={t === lo ? 'base' : undefined} />
                <text className="tick" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {fmt.num(t)}
                </text>
              </g>
            ))}
          </g>

          {kind === 'column' &&
            points.map((p, i) => {
              if (p.y === null) return null;
              const w = Math.min(24, band * 0.62);
              const top = y(p.y);
              return (
                <g key={p.x} onPointerEnter={() => setActive(i)}>
                  <rect x={x(i) - band / 2} y={M.top} width={band} height={innerH} fill="transparent" />
                  <path
                    className={`bar${active !== null && active !== i ? ' dim' : ''}`}
                    d={columnPath(x(i) - w / 2, top, w, y(lo) - top)}
                  />
                  <text className="tick" x={x(i)} y={height - 6} textAnchor="middle">
                    {tickLabel(p.x)}
                  </text>
                  {i === peakIndex && active === null && (
                    <text className="peak" x={x(i)} y={top - 5} textAnchor="middle">
                      {fmt.num(p.y)}
                    </text>
                  )}
                </g>
              );
            })}

          {kind === 'line' && (
            <>
              {area && <path className="area" d={linePath(points, x, y, y(lo))} />}
              <path className="line" d={linePath(points, x, y)} />
              {ticks.map((t) => (
                <text key={t} className="tick" x={xAt(t)} y={height - 6} textAnchor="middle">
                  {tickLabel(t)}
                </text>
              ))}
              {current && current.y !== null && (
                <>
                  <line className="cross" x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + innerH} />
                  <circle className="dot" cx={x(active!)} cy={y(current.y)} r={4} />
                </>
              )}
            </>
          )}
        </svg>
      )}
      {current && (
        <div className="chart-tip" style={{ left: clamp(x(active!), 70, width - 70), top: 34 }} role="status">
          <strong>{current.y === null ? 'No value' : `${fmt.num(current.y)} ${unit}`}</strong>
          <span>{tipLabel(current.x)}</span>
        </div>
      )}
    </figure>
  );
}

/** Round, evenly spaced axis values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/** Square at the baseline, 4px rounded at the data end. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.max(0, Math.min(4, w / 2, h));
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

/** A line through the points, broken at nulls. With `base`, closed down to it as an area. */
function linePath(points: Point[], x: (i: number) => number, y: (v: number) => number, base?: number): string {
  const runs: Array<Array<[number, number]>> = [[]];
  points.forEach((p, i) => {
    if (p.y === null) runs.push([]);
    else runs[runs.length - 1]!.push([x(i), y(p.y)]);
  });
  return runs
    .filter((run) => run.length > 0)
    .map((run) => {
      const line = run.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
      return base === undefined ? line : `${line}L${run[run.length - 1]![0]},${base}L${run[0]![0]},${base}Z`;
    })
    .join('');
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
