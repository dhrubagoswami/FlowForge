// Computes the next occurrence of a cron expression from now. Returns null for any expression cron-parser can't parse.
import { CronExpressionParser } from 'cron-parser';

export function nextCronOccurrence(cronExpr: string, timezone: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cronExpr, { currentDate: new Date(), tz: timezone });
    return interval.next().toDate();
  } catch {
    return null;
  }
}
