const IST = 'Asia/Kolkata';
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const dayShort = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric' });
const dayLong = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' });
const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const time = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

export const fmt = {
  num: (n: number) => number.format(n),
  whole: (n: number) => whole.format(n),
  pct: (part: number, total: number) => (total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`),
  dayShort: (ms: number) => dayShort.format(ms),
  dayLong: (ms: number) => dayLong.format(ms),
  dateTime: (ms: number) => dateTime.format(ms),
  time: (ms: number) => time.format(ms),
  /** "2026-06-24", the IST calendar day of an instant. */
  istDay: (ms: number) => isoDay.format(ms),
  ago(iso: string, now = Date.now()) {
    const minutes = Math.round((now - Date.parse(iso)) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return `${hours} h ago`;
  },
};

export const STATUS_LABEL = { installed: 'Installed', faulty: 'Faulty', decommissioned: 'Decommissioned' } as const;
export const PHASE_LABEL = { single: 'Single phase', three: 'Three phase' } as const;
export const INSTALL_LABEL = { whole_current: 'Whole current', ct_operated: 'CT operated' } as const;
export const LEVEL_LABEL = {
  zone: 'Zone',
  circle: 'Circle',
  division: 'Division',
  subdivision: 'Subdivision',
  substation: 'Substation',
  feeder: 'Feeder',
  transformer: 'Transformer',
} as const;
