import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import type { Browser } from 'playwright';
import { getRandomUserAgent } from '../utils/userAgent';
import { UpstreamBlockedError } from '../utils/errors';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Serializes all outbound OLX requests; the old timestamp check raced under
// concurrent requests and let bursts through.
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: parseInt(process.env.REQUEST_DELAY_MS || '2000', 10),
});

const cookieJar = new CookieJar();
const client: AxiosInstance = wrapper(axios.create({
  jar: cookieJar,
  maxRedirects: 5,
  timeout: 15000,
  responseType: 'text',
  validateStatus: (status) => status < 400,
}));

axiosRetry(client, {
  retries: 2,
  retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount) + Math.random() * 500,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
});

/**
 * Detect a real anti-bot challenge. Normal OLX pages contain the literal
 * string "captchaSiteKey" in their JS config, so a bare "captcha" substring
 * match false-positives on every page; instead look for actual challenge
 * vendors (DataDome, Cloudflare) or a small page without OLX's state blob.
 */
function looksBlocked(body: string, expectJson: boolean): boolean {
  if (expectJson) return body.trimStart().startsWith('<');

  const challengeMarkers = [
    'captcha-delivery.com',
    'geo.captcha-delivery',
    'cf-chl',
    '_cf_chl_opt',
    'challenge-platform',
  ];
  if (challengeMarkers.some((m) => body.includes(m))) return true;

  // Real OLX pages are large and embed the prerendered state; block pages
  // are small static shells.
  return !body.includes('__PRERENDERED_STATE__') && body.length < 50_000;
}

export async function fetchPage(url: string, expectJson = false): Promise<string> {
  return limiter.schedule(() => doFetch(url, expectJson));
}

async function doFetch(url: string, expectJson: boolean): Promise<string> {
  // Small jitter on top of the limiter's fixed spacing
  await delay(Math.floor(Math.random() * 500));

  const userAgent = getRandomUserAgent();

  const headers: Record<string, string> = expectJson
    ? {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.olx.pl/',
        'Connection': 'keep-alive',
      }
    : {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.olx.pl/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      };

  try {
    const response = await client.get(url, { headers });
    const body: string = response.data;

    if (looksBlocked(body, expectJson)) {
      console.error('Challenge detected, trying Playwright fallback...');
      return fetchWithPlaywright(url);
    }

    return body;
  } catch (err: any) {
    if (err.response?.status === 403 || err.response?.status === 429) {
      console.error(`Got ${err.response.status}, trying Playwright fallback...`);
      return fetchWithPlaywright(url);
    }
    throw err;
  }
}

// Lazily-launched singleton browser; a fresh chromium.launch() per request
// costs 1-3s and a memory spike.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
      return chromium.launch({ headless: true, executablePath });
    })();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending.catch(() => null);
  await browser?.close().catch(() => {});
}

async function fetchWithPlaywright(url: string): Promise<string> {
  if (process.env.PLAYWRIGHT_ENABLED === 'false') {
    throw new UpstreamBlockedError('Request was challenged and Playwright fallback is disabled');
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: getRandomUserAgent(),
    locale: 'pl-PL',
    extraHTTPHeaders: { 'Accept-Language': 'pl-PL,pl;q=0.9' },
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // For JSON API URLs, browsers wrap the response in HTML (<pre> tag).
    // Extract the inner text to get the raw JSON.
    const pre = page.locator('body > pre');
    if (await pre.count() > 0) {
      return await pre.innerText();
    }
    return await page.content();
  } finally {
    await context.close();
  }
}
