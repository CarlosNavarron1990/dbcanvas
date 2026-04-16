// Zero-dependency logger — writes directly to stderr (fd 2).
// CRITICAL: MCP servers use stdout for JSON-RPC protocol.
// ALL logging MUST go to stderr, never stdout.

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVELS: Record<LogLevel, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60,
};

function write(level: LogLevel, component: string | null, data: Record<string, unknown> | string, msg?: string): void {
  const envLevel = process.env.LOG_LEVEL || 'info';
  if (LEVELS[level] < (LEVELS[envLevel as LogLevel] ?? 30)) return;

  const entry: Record<string, unknown> = {
    level: LEVELS[level],
    time: Date.now(),
    name: 'dbcanvas',
  };
  if (component) entry.component = component;
  if (typeof data === 'string') {
    entry.msg = data;
  } else {
    Object.assign(entry, data);
    if (msg) entry.msg = msg;
  }
  process.stderr.write(JSON.stringify(entry) + '\n');
}

function makeLogger(component: string | null) {
  return {
    trace: (data: Record<string, unknown> | string, msg?: string) => write('trace', component, data, msg),
    debug: (data: Record<string, unknown> | string, msg?: string) => write('debug', component, data, msg),
    info:  (data: Record<string, unknown> | string, msg?: string) => write('info',  component, data, msg),
    warn:  (data: Record<string, unknown> | string, msg?: string) => write('warn',  component, data, msg),
    error: (data: Record<string, unknown> | string, msg?: string) => write('error', component, data, msg),
    fatal: (data: Record<string, unknown> | string, msg?: string) => write('fatal', component, data, msg),
    child: (bindings: Record<string, string>) => makeLogger(bindings.component || component),
  };
}

export const logger = makeLogger(null);

export function createChildLogger(component: string) {
  return makeLogger(component);
}
