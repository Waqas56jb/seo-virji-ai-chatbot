/** Structured JSON logger. Never pass secrets or full conversation text into logs. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'warn' : 'info')] ?? 20;

function write(level, event, meta = {}) {
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...meta });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (e, m) => write('debug', e, m),
  info: (e, m) => write('info', e, m),
  warn: (e, m) => write('warn', e, m),
  error: (e, m) => write('error', e, m),
};
