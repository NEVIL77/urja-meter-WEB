import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  LEVELS,
  pathOf,
  useApi,
  type Health,
  type HierarchyResponse,
  type Meter,
  type MeterPage,
  type Status,
  type Transformer,
  type TreeNode,
} from './api';
import { OptionSelect } from './components/OptionSelect';
import { Input } from '@/components/ui/input';
import { DataQuality } from './components/DataQuality';
import { MeterMap } from './components/MeterMap';
import { MeterPanel } from './components/MeterPanel';
import { NetworkTree, NO_METERS, type Counts } from './components/NetworkTree';
import { StatusMark, STATUSES } from './components/StatusMark';
import { fmt, INSTALL_LABEL, PHASE_LABEL, STATUS_LABEL } from './format';

interface Filters {
  q: string;
  statuses: Set<Status>;
  make: string;
  phase: '' | Meter['phase'];
  installType: '' | Meter['installType'];
  path: string | null;
}
const NO_FILTERS: Filters = { q: '', statuses: new Set(STATUSES), make: '', phase: '', installType: '', path: null };

function matches(m: Meter, f: Filters, { ignorePath = false, ignoreStatus = false } = {}): boolean {
  const q = f.q.trim().toLowerCase();
  return (
    (!q || m.id.toLowerCase().includes(q) || m.serialNo.toLowerCase().includes(q)) &&
    (ignoreStatus || f.statuses.has(m.status)) &&
    (!f.make || m.make === f.make) &&
    (!f.phase || m.phase === f.phase) &&
    (!f.installType || m.installType === f.installType) &&
    (ignorePath || !f.path || `${pathOf(m)}/`.startsWith(`${f.path}/`))
  );
}

function count(meters: Meter[]): Counts {
  const c = { ...NO_METERS };
  for (const m of meters) {
    c.total++;
    c[m.status]++;
  }
  return c;
}

/** Meter counts for every node on every meter's path. */
function countByPath(meters: Meter[]): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const m of meters) {
    let path = '';
    for (const level of LEVELS) {
      path = path ? `${path}/${m.hierarchy[level].code}` : m.hierarchy[level].code;
      const c = out.get(path) ?? { ...NO_METERS };
      c.total++;
      c[m.status]++;
      out.set(path, c);
    }
  }
  return out;
}

export function App() {
  const [theme, setTheme] = useTheme();
  const now = useNow(30_000);
  
  const health = useApi<Health>('/health', 60_000);
  const meters = useApi<MeterPage>('/meters?limit=500');
  const hierarchy = useApi<HierarchyResponse>('/hierarchy');
  const transformers = useApi<{ items: Transformer[] }>('/transformers');

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'network' | 'quality'>('network');

  const all = useMemo(() => meters.data?.items ?? [], [meters.data]);
  const outsidePath = useMemo(() => all.filter((m) => matches(m, filters, { ignorePath: true })), [all, filters]);
  const visible = useMemo(() => all.filter((m) => matches(m, filters)), [all, filters]);
  const statusCounts = useMemo(() => count(all.filter((m) => matches(m, filters, { ignoreStatus: true }))), [all, filters]);
  const treeCounts = useMemo(() => countByPath(outsidePath), [outsidePath]);
  const makes = useMemo(() => [...new Set(all.map((m) => m.make))].sort(), [all]);
  const tByCode = useMemo(() => new Map((transformers.data?.items ?? []).map((t) => [t.code, t])), [transformers.data]);
  const capacity = useMemo(() => new Map([...tByCode].map(([code, t]) => [code, t.capacityKva])), [tByCode]);
  const selected = all.find((m) => m.id === selectedId) ?? null;
  const shown = count(visible);
  const transformersInView = new Set(visible.map((m) => m.hierarchy.transformer.code)).size;
  const changed =
    filters.q || filters.make || filters.phase || filters.installType || filters.path || filters.statuses.size < 3;

  const selectPath = useCallback((path: string | null) => {
    setFilters((f) => ({ ...f, path }));
    setTab('network');
  }, []);
  const toggleStatus = (s: Status) =>
    setFilters((f) => {
      const statuses = new Set(f.statuses);
      if (statuses.has(s) && statuses.size > 1) statuses.delete(s);
      else statuses.add(s);
      return { ...f, statuses };
    });

  if (meters.error && !meters.data) {
    return (
      <div className="app">
        <TopBar theme={theme} setTheme={setTheme} health={null} now={now} />
        <div className="empty" role="alert">
          <p>
            <strong>The API is not answering.</strong>
          </p>
          <p>Start it from the project folder with npm start; it listens on port 3000.</p>
          <button className="ghost" onClick={meters.retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar theme={theme} setTheme={setTheme} health={health.data} now={now} />

      <div className="filters" role="search">
        <Input
          className="w-[220px] bg-background"
          type="search"
          placeholder="Meter ID or serial number"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          aria-label="Search by meter ID or serial number"
        />
        {STATUSES.map((s) => (
          <button key={s} className="chip" aria-pressed={filters.statuses.has(s)} onClick={() => toggleStatus(s)}>
            <StatusMark status={s} /> {STATUS_LABEL[s]} <span className="count">{statusCounts[s]}</span>
          </button>
        ))}
        <OptionSelect
          label="Make"
          allLabel="All makes"
          value={filters.make}
          onChange={(make) => setFilters((f) => ({ ...f, make }))}
          options={makes.map((m) => ({ value: m, label: m }))}
        />
        <OptionSelect
          label="Phase"
          allLabel="Any phase"
          value={filters.phase}
          onChange={(phase) => setFilters((f) => ({ ...f, phase: phase as Filters['phase'] }))}
          options={Object.entries(PHASE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <OptionSelect
          label="Installation type"
          allLabel="Any installation"
          value={filters.installType}
          onChange={(installType) => setFilters((f) => ({ ...f, installType: installType as Filters['installType'] }))}
          options={Object.entries(INSTALL_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {filters.path && (
          <span className="path-chip">
            <span className="mono">{filters.path}</span>
            <button onClick={() => selectPath(null)} aria-label="Clear network filter">
              ×
            </button>
          </span>
        )}
        {changed && (
          <button className="reset" onClick={() => setFilters(NO_FILTERS)}>
            Reset filters
          </button>
        )}
      </div>

      <div className="summary" aria-live="polite">
        <div className="tile">
          <div className="label">Meters in view</div>
          <div className="value">
            {shown.total}
            <small>of {all.length}</small>
          </div>
        </div>
        <div className="tile">
          <div className="label">Faulty</div>
          <div className="value">{fmt.pct(shown.faulty, shown.total)}</div>
        </div>
        <div className="tile">
          <div className="label">Transformers</div>
          <div className="value">{transformersInView}</div>
        </div>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setTab('quality')}>
          <div className="label">Records repaired</div>
          <div className="value">
            {hierarchy.data?.dataQuality.repairs.length ?? '–'}
            <small>see why</small>
          </div>
        </button>
      </div>

      <main className={`main${selected ? ' with-panel' : ''}`}>
        <section className="card tree-card" aria-label="Network and data quality">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'network'} onClick={() => setTab('network')}>
              Network
            </button>
            <button role="tab" aria-selected={tab === 'quality'} onClick={() => setTab('quality')}>
              Data quality
            </button>
          </div>
          <div className="scroll">
            {!hierarchy.data ? (
              <p className="empty">{hierarchy.error ? hierarchy.error.message : 'Loading the network…'}</p>
            ) : tab === 'network' ? (
              <NetworkTree
                tree={hierarchy.data.tree as unknown as TreeNode[]}
                counts={treeCounts}
                capacityKva={capacity}
                selectedPath={filters.path}
                onSelect={selectPath}
              />
            ) : (
              <DataQuality
                repairs={hierarchy.data.dataQuality.repairs}
                reusedCodes={hierarchy.data.dataQuality.reusedCodes}
                onSelectMeter={setSelectedId}
                onSelectPath={selectPath}
              />
            )}
          </div>
        </section>

        <MeterMap
          meters={visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          fitKey={`${filters.path ?? 'all'}|${filters.q.trim()}`}
        />

        {selected && (
          <MeterPanel
            key={selected.id}
            meter={selected}
            transformer={tByCode.get(selected.hierarchy.transformer.code)}
            onClose={() => setSelectedId(null)}
            onSelectPath={selectPath}
          />
        )}
      </main>
    </div>
  );
}

type Theme = 'auto' | 'light' | 'dark';

interface TopBarProps {
  theme: Theme;
  setTheme: (t: Theme, from?: { x: number; y: number }) => void;
  health: Health | null;
  now: number;
}

function TopBar({ theme, setTheme, health, now }: TopBarProps) {
  const next: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <h1>Urja Meter Ops</h1>
        <span className="sub">Network view · Jaipur</span>
      </div>
      <span className="spacer" />
      {health && (
        <span className={`pill ${health.status}`} title={health.lastError ?? undefined}>
          <span className="lamp" />
          {health.status === 'ok'
            ? `Synced ${health.syncedAt ? fmt.ago(health.syncedAt, now) : ''}`
            : health.status === 'degraded'
              ? `Portal unreachable, showing data from ${health.syncedAt ? fmt.ago(health.syncedAt, now) : 'earlier'}`
              : 'No data from the portal yet'}
        </span>
      )}
      <a href="http://localhost:3000/docs" target="_blank" rel="noreferrer">
        API docs
      </a>
      <button
        className="ghost"
        title="Switch theme"
        onClick={(e) => {
          // The ripple starts at the button's centre, so it looks the same for a click and for Enter.
          const r = e.currentTarget.getBoundingClientRect();
          setTheme(next[theme], { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }}
      >
        Theme: {theme}
      </button>
    </header>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 22a11 11 0 0 1 22 0" fill="none" style={{ stroke: 'var(--live)' }} strokeWidth="4" strokeLinecap="round" />
      <path d="M16 22l6-8" style={{ stroke: 'var(--ink)' }} strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="22" r="2.6" style={{ fill: 'var(--ink)' }} />
    </svg>
  );
}

/** The chosen theme (auto follows the system), stored per browser. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });

  // A layout effect, so <html> already carries the new theme when a view
  // transition takes its "after" snapshot inside flushSync below.
  useLayoutEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Private windows can refuse storage; the theme just will not be remembered.
    }
  }, [theme]);

  /**
   * Switches the theme. Given a point, the new theme is revealed as a circle
   * growing from it: the browser snapshots the page before and after, and only
   * a clip-path on the "after" snapshot animates, which the GPU composites, so
   * it stays smooth however busy the map is. No View Transitions support, or
   * reduced motion asked for: it just switches.
   */
  const switchTheme = (next: Theme, from?: { x: number; y: number }) => {
    const looksDark = (t: Theme) => t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const ripple =
      from &&
      'startViewTransition' in document &&
      looksDark(next) !== looksDark(theme) &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!ripple) {
      setTheme(next);
      return;
    }
    const radius = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)));
    transition.ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${radius}px at ${from.x}px ${from.y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    );
  };

  return [theme, switchTheme] as const;
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
