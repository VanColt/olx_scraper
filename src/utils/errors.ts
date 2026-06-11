import { Response } from 'express';

/** OLX blocked or challenged the request (captcha, 403/429, challenge page). */
export class UpstreamBlockedError extends Error {
  readonly retryable = true;
  constructor(message = 'Upstream request was blocked or challenged') {
    super(message);
    this.name = 'UpstreamBlockedError';
  }
}

/** A name/slug filter (city, region, category) that OLX doesn't recognize. */
export class UnknownFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownFilterError';
  }
}

/** OLX responded, but the payload no longer matches the shape we expect. */
export class UpstreamParseError extends Error {
  readonly retryable = false;
  constructor(message = 'Upstream response could not be parsed') {
    super(message);
    this.name = 'UpstreamParseError';
  }
}

/**
 * Map an error to an agent-friendly HTTP response: 404 for missing resources,
 * 503 + retryable for blocks (back off and retry), 502 for parse drift
 * (retrying won't help), 500 otherwise.
 */
export function sendError(res: Response, err: unknown, what: string): void {
  const e = err as any;
  if (e?.response?.status === 404) {
    res.status(404).json({ error: `${what} not found` });
    return;
  }
  if (err instanceof UnknownFilterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof UpstreamBlockedError) {
    res.status(503).json({ error: `OLX blocked the request while fetching ${what}`, retryable: true });
    return;
  }
  if (err instanceof UpstreamParseError) {
    res.status(502).json({ error: `OLX response for ${what} did not match the expected format`, retryable: false });
    return;
  }
  console.error(`${what} error:`, e?.message || err);
  res.status(500).json({ error: `Failed to fetch ${what}`, details: e?.message });
}
