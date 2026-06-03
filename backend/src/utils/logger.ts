import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(errors({ stack: true }), timestamp({ format: 'HH:mm:ss.SSS' }), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss.SSS' }), logFormat),
    }),
    new winston.transports.File({ filename: 'logs/prisma-ai.log', maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/lifecycle.log', level: 'info', maxsize: 52428800 }),
  ],
});

export default logger;
