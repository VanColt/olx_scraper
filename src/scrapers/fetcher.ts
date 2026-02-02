import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { getRandomUserAgent } from '../utils/userAgent';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getRandomDelay(): number {
  const base = parseInt(process.env.REQUEST_DELAY_MS || '2000', 10);
  return base + Math.floor(Math.random() * 1000);
}

let lastRequestTime = 0;

const cookieJar = new CookieJar();
const client: AxiosInstance = wrapper(axios.create({
  jar: cookieJar,
  maxRedirects: 5,
  timeout: 15000,
  responseType: 'text',
  validateStatus: (status) => status < 400,
}));

export async function fetchPage(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const minDelay = getRandomDelay();
  if (elapsed < minDelay) {
    await delay(minDelay - elapsed);
  }
  lastRequestTime = Date.now();

  const userAgent = getRandomUserAgent();

  try {
    const response = await client.get(url, {
      headers: {
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
      },
    });
    const html: string = response.data;

    if (html.includes('captcha') || html.includes('cf-challenge')) {
      console.log('Captcha/challenge detected, trying Playwright fallback...');
      return fetchWithPlaywright(url);
    }

    return html;
  } catch (err: any) {
    if (err.response?.status === 403 || err.response?.status === 429) {
      console.log(`Got ${err.response.status}, trying Playwright fallback...`);
      return fetchWithPlaywright(url);
    }
    throw err;
  }
}

async function fetchWithPlaywright(url: string): Promise<string> {
  if (process.env.PLAYWRIGHT_ENABLED === 'false') {
    throw new Error('Playwright fallback is disabled and axios request failed');
  }

  const { chromium } = await import('playwright');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await browser.close();
  }
}
