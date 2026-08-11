// The one pino instance for the worker — everything else imports this rather than constructing its own.
import pino from 'pino';
import { env } from '../config/env.ts';

export const logger = pino({ level: env.LOG_LEVEL });
