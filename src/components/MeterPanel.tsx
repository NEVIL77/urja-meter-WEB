import { LEVELS, useApi, type Meter, type Reading, type Readings, type Transformer } from '../api';
import { fmt, INSTALL_LABEL, LEVEL_LABEL, PHASE_LABEL, STATUS_LABEL } from '../format';
import { Chart, type Point } from './Chart';
import { StatusMark } from './StatusMark';

interface Props {
  meter: Meter;
  transformer: Transformer | undefined;
  onClose: () => void;
  onSelectPath: (path: string) => void;
}

export function MeterPanel({ meter, transformer, onClose, onSelectPath }: Props) {
  const readings = useApi<Readings>(`/meters/${encodeURIComponent(meter.id)}/readings`);
  const h = meter.hierarchy;

  return (
    <section className="card panel-card" aria-label={`Meter ${meter.id}`}>
      <header className="panel-head">
        <div>
          <h2>{meter.id}</h2>
          <div className="status-line">
            <StatusMark status={meter.status} /> {STATUS_LABEL[meter.status]}
            <span className="muted">· {meter.make}</span>
          </div>
        </div>
        <button className="close" onClick={onClose} aria-label="Close meter details">
          ×
        </button>
      </header>

      <div className="scroll">
        <div className="panel-body">
          <dl className="facts">
            <dt>Serial</dt>
            <dd className="mono">{meter.serialNo}</dd>
            <dt>Supply</dt>
            <dd>
              {PHASE_LABEL[meter.phase]}, {INSTALL_LABEL[meter.installType].toLowerCase()}
            </dd>
            <dt>Transformer</dt>
            <dd>
              {h.transformer.name} <span className="mono muted">{h.transformer.code}</span>
              {transformer?.capacityKva != null && <span className="muted"> · {transformer.capacityKva} kVA</span>}
            </dd>
            <dt>Location</dt>
            <dd className="mono">
              {meter.location.lat.toFixed(5)}, {meter.location.lng.toFixed(5)}
            </dd>
          </dl>

          <div>
            <p className="section-title">Network</p>
            <nav className="crumbs" aria-label="Where this meter sits">
              {LEVELS.map((level, i) => {
                const path = LEVELS.slice(0, i + 1).map((l) => h[l].code).join('/');
                const node = h[level];
                return (
                  <span key={level} style={{ display: 'contents' }}>
                    {i > 0 && <span className="sep">›</span>}
                    <button onClick={() => onSelectPath(path)} title={`${LEVEL_LABEL[level]}: ${node.name}. Show its meters`}>
                      {node.name ? (
                        <>
                          {node.name} <span className="code">({node.code})</span>
                        </>
                      ) : (
                        <span className="code">{node.code}</span>
                      )}
                    </button>
                  </span>
                );
              })}
            </nav>
          </div>

          <ReadingsView meter={meter} state={readings} />
        </div>
      </div>
    </section>
  );
}

function ReadingsView({ meter, state }: { meter: Meter; state: ReturnType<typeof useApi<Readings>> }) {
  const { data, error, loading, retry } = state;
  // The previous meter's readings stay on screen while the next ones load; never show them as this meter's.
  const r = data?.meterId === meter.id ? data : null;

  if (error && !r) {
    const busy = error.code === 'portal_rate_limited';
    return (
      <div className="error-box" role="alert">
        {busy
          ? 'The portal is rate-limiting requests right now. It usually clears within a minute.'
          : `Readings could not be loaded: ${error.message}`}
        <div>
          <button className="ghost" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!r) return <p className="muted">{loading ? 'Loading readings from the portal…' : null}</p>;

  const interval = r.intervalMinutes ?? 1440;
  const days = dailyUse(r.readings, interval);
  const daysTotal = days.reduce((sum, d) => sum + (d.y ?? 0), 0);
  const volts = r.readings.flatMap((x) => (x.voltageR === null ? [] : [x.voltageR]));
  const first = Date.parse(r.readings[0]?.timestamp ?? '');
  const last = Date.parse(r.readings[r.readings.length - 1]?.timestamp ?? '');
  const midnights = r.readings.map((x) => Date.parse(x.timestamp)).filter((t) => fmt.time(t) === '00:00');

  return (
    <>
      {meter.status === 'decommissioned' && r.totalKwhUsed > 0 && (
        <div className="notice" role="note">
          <WarningIcon />
          <span>
            <strong>Marked decommissioned, but still recording use:</strong> {fmt.num(r.totalKwhUsed)} kWh between{' '}
            {fmt.dayLong(first)} and {fmt.dayLong(last)}. Either the status or the readings are wrong.
          </span>
        </div>
      )}

      <div>
        <p className="section-title">
          Consumption, {fmt.dayLong(first)} – {fmt.dayLong(last)}
        </p>
        <div className="stats">
          <div className="tile">
            <div className="label">Used in total</div>
            <div className="value">
              {fmt.num(r.totalKwhUsed)}
              <small>kWh</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">Average a day</div>
            <div className="value">
              {days.length ? fmt.num(daysTotal / days.length) : '–'}
              <small>kWh</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">Reads every</div>
            <div className="value">{interval >= 1440 ? 'Day' : `${interval} min`}</div>
          </div>
          <div className="tile">
            <div className="label">Voltage range</div>
            <div className="value">
              {volts.length ? `${Math.min(...volts)}–${Math.max(...volts)}` : '–'}
              <small>V</small>
            </div>
          </div>
        </div>
      </div>

      <Chart
        title="Daily use, kWh"
        note="Whole IST days only; a day with missing readings is left out."
        kind="column"
        unit="kWh"
        points={days}
        tickLabel={fmt.dayShort}
        tipLabel={fmt.dayLong}
      />

      {interval < 1440 && (
        <Chart
          title={`Use per ${interval} minutes, kWh`}
          kind="line"
          area
          zeroBased
          unit="kWh"
          points={r.readings.map((x) => ({ x: Date.parse(x.timestamp), y: x.kwhUsed }))}
          ticks={midnights}
          tickLabel={fmt.dayShort}
          tipLabel={fmt.dateTime}
        />
      )}

      <Chart
        title="Voltage, R phase, V"
        kind="line"
        unit="V"
        points={r.readings.map((x) => ({ x: Date.parse(x.timestamp), y: x.voltageR }))}
        ticks={midnights}
        tickLabel={fmt.dayShort}
        tipLabel={interval >= 1440 ? fmt.dayLong : fmt.dateTime}
        height={130}
      />

      <details className="table-view">
        <summary>Show all {r.readings.length} readings as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time (IST)</th>
                <th>Register kWh</th>
                <th>Used kWh</th>
                <th>Volts</th>
              </tr>
            </thead>
            <tbody>
              {r.readings.map((x) => (
                <tr key={x.timestamp}>
                  <td>{fmt.dateTime(Date.parse(x.timestamp))}</td>
                  <td>{x.kwhCumulative === null ? '–' : fmt.num(x.kwhCumulative)}</td>
                  <td>{x.kwhUsed === null ? '–' : fmt.num(x.kwhUsed)}</td>
                  <td>{x.voltageR ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Fetched from the portal {fmt.ago(r.fetchedAt)}.
        {r.duplicatesDropped > 0 &&
          ` The portal sent ${r.duplicatesDropped} reading${r.duplicatesDropped > 1 ? 's' : ''} twice; the duplicate was dropped.`}
      </p>
    </>
  );
}

/**
 * kWh per IST day. A reading's usage belongs to the interval that ends at it,
 * so a daily reading at 00:00 on the 24th is the use of the 23rd. Days that
 * are not fully covered are dropped, so a part day never looks like a quiet one.
 */
function dailyUse(readings: Reading[], intervalMinutes: number): Point[] {
  const days = new Map<string, { kwh: number; minutes: number }>();
  for (const r of readings) {
    if (r.kwhUsed === null) continue;
    const day = fmt.istDay(Date.parse(r.timestamp) - intervalMinutes * 60_000);
    const d = days.get(day) ?? { kwh: 0, minutes: 0 };
    d.kwh += r.kwhUsed;
    d.minutes += intervalMinutes;
    days.set(day, d);
  }
  return [...days]
    .filter(([, d]) => d.minutes >= 1440)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ x: Date.parse(`${day}T00:00:00+05:30`), y: Math.round(d.kwh * 100) / 100 }));
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 15 14H1Z" style={{ fill: 'var(--warn-mark)' }} />
      <path d="M8 6v3.6M8 11.6v.2" style={{ stroke: '#3a2a00', strokeWidth: 1.6, strokeLinecap: 'round' }} />
    </svg>
  );
}
