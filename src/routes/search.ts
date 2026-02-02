import { Router, Request, Response } from 'express';
import { fetchPage } from '../scrapers/fetcher';
import { parseSearchResults } from '../scrapers/searchParser';
import { SearchResult } from '../types';

const router = Router();

/**
 * @openapi
 * /olx/v1/search/{query}:
 *   get:
 *     tags: [Search]
 *     summary: Search OLX listings
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 40
 *         description: Max results to return (auto-paginates)
 *       - in: query
 *         name: min_price
 *         schema:
 *           type: integer
 *         description: Minimum price filter
 *       - in: query
 *         name: max_price
 *         schema:
 *           type: integer
 *         description: Maximum price filter
 *       - in: query
 *         name: has_delivery
 *         schema:
 *           type: boolean
 *         description: Only listings with delivery
 *       - in: query
 *         name: condition
 *         schema:
 *           type: string
 *           enum: [new, used]
 *         description: Item condition
 *       - in: query
 *         name: negotiable
 *         schema:
 *           type: boolean
 *         description: Only listings with negotiable price
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Category slug (e.g. elektronika)
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/:query', async (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 40);
    const minPrice = req.query.min_price as string | undefined;
    const maxPrice = req.query.max_price as string | undefined;
    const hasDelivery = req.query.has_delivery as string | undefined;
    const condition = req.query.condition as string | undefined;
    const category = req.query.category as string | undefined;
    const slug = query.trim().replace(/\s+/g, '-');
    const basePath = category
      ? `https://www.olx.pl/${category}/q-${slug}/`
      : `https://www.olx.pl/oferty/q-${slug}/`;

    // Build OLX filter params
    const filters: string[] = [];
    if (minPrice) filters.push(`search[filter_float_price:from]=${minPrice}`);
    if (maxPrice) filters.push(`search[filter_float_price:to]=${maxPrice}`);
    if (hasDelivery === 'true') filters.push('search[filter_enum_delivery:0]=courier');
    if (condition === 'new' || condition === 'used') filters.push(`search[filter_enum_state:0]=${condition}`);

    const collected: SearchResult[] = [];
    let page = 1;
    let totalCount = 0;

    while (collected.length < limit) {
      const params = [...filters];
      if (page > 1) params.push(`page=${page}`);
      const qs = params.length ? '?' + params.join('&') : '';
      const url = basePath + qs;

      const html = await fetchPage(url);
      const parsed = parseSearchResults(html, page);

      if (page === 1) totalCount = parsed.totalCount;
      if (parsed.results.length === 0) break;

      collected.push(...parsed.results);
      page++;
    }

    const results = collected.slice(0, limit);
    res.json({ totalCount, limit, results });
  } catch (err: any) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Failed to fetch search results', details: err.message });
  }
});

export default router;
