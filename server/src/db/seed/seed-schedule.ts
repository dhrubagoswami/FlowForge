// Expands a job's cron expression into the actual scheduled_at timestamps that fell within the seed window.
import { CronExpressionParser } from 'cron-parser';

export function expandCronOccurrences(cronExpr: string, tz: string, windowStart: Date, windowEnd: Date): Date[] {
  const interval = CronExpressionParser.parse(cronExpr, { currentDate: windowStart, endDate: windowEnd, tz });
  const occurrences: Date[] = [];
  while (interval.hasNext()) {
    occurrences.push(interval.next().toDate());
  }
  return occurrences;
}
