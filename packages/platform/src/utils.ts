import { Response } from 'express';

/** Express 5 res.json() can mangle objects. Use this instead. */
export function sendJson(res: Response, data: unknown, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(data));
}

export function sendError(res: Response, status: number, message: string) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify({ error: message }));
}
