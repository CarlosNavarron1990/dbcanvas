import pino from 'pino';

// CRITICAL: MCP servers use stdout for JSON-RPC protocol.
// ALL logging MUST go to stderr (fd 2), never stdout.
export const logger = pino({
  name: 'dbcanvas',
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 2 }, // fd 2 = stderr, ALWAYS
  },
});

export function createChildLogger(component: string) {
  return logger.child({ component });
}
