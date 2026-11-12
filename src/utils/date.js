import config from '../config/index.js';

const tz = config.timezone;
const toUTC = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);

export const todayStr = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: tz });
export const nowHM = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
export const currentMonth = () => todayStr().slice(0, 7);
export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(toUTC(s));
export const isValidMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');

export const addDays = (s, n) => {
  const d = toUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
export const isWeekend = (s) => [0, 6].includes(toUTC(s).getUTCDay());
export const eachDay = (a, b) => {
  const out = [];
  for (let c = a; c <= b; c = addDays(c, 1)) out.push(c);
  return out;
};
/** Working days (Mon-Fri) between two YYYY-MM-DD strings, inclusive. */
export const weekdays = (a, b) => (a > b ? [] : eachDay(a, b).filter((d) => !isWeekend(d)));
export const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return { start: `${m}-01`, end: fmt(new Date(Date.UTC(y, mo, 0))) };
};
export const tzOffsetStr = (dateStr = todayStr(), timeZone = tz) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const utcDate = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(d.toLocaleString('en-US', { timeZone }));
  const diffMinutes = Math.round((tzDate - utcDate) / 60000);
  const sign = diffMinutes >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(diffMinutes) / 60)).padStart(2, '0');
  const mins = String(Math.abs(diffMinutes) % 60).padStart(2, '0');
  return `${sign}${hours}:${mins}`;
};

export const parseDateTimeInTz = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return undefined;
  const offset = tzOffsetStr(dateStr, tz);
  return new Date(`${dateStr}T${timeStr}:00${offset}`);
};

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
