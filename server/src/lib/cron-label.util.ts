// Maps a cron expression to a short human-readable schedule label. Falls back to the raw expression for any pattern it doesn't recognise — never throws.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function cronToLabel(cronExpr: string, timezone: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return cronExpr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const everyNMinutes = minute.match(/^\*\/(\d+)$/);
  if (everyNMinutes && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every ${everyNMinutes[1]} min`;
  }

  const isFixedTime = /^\d+$/.test(minute) && /^\d+$/.test(hour);
  const timeLabel = isFixedTime ? `${pad2(Number(hour))}:${pad2(Number(minute))} ${timezone}` : null;

  if (isFixedTime && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily ${timeLabel}`;
  }

  const isSingleWeekday = /^[0-6]$/.test(dayOfWeek);
  if (isFixedTime && isSingleWeekday && dayOfMonth === '*' && month === '*') {
    return `${DAY_NAMES[Number(dayOfWeek)]} ${timeLabel}`;
  }

  return cronExpr;
}
