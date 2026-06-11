import { Router, Request, Response } from 'express';
import { searchListings } from '../services/olx';
import { SearchQuerySchema } from '../schemas';
import { sendError } from '../utils/errors';

const router = Router();

/**
 * @openapi
 * /olx/v1/search/{query}:
 *   get:
 *     tags: [Search]
 *     summary: Search OLX listings
 *     description: >
 *       Searches OLX.pl via its offers API with auto-pagination. Results
 *       include a truncated description (~300 chars), the first photos,
 *       seller info and coordinates, so listings can be classified without
 *       fetching each product. Prices are structured objects (numeric value,
 *       currency, display string, negotiable flag) and dates ISO 8601.
 *       Promoted ads are always pinned first by OLX regardless of sort.
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
 *           maximum: 200
 *         description: Max results to return (auto-paginates, capped at 200)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           maximum: 960
 *         description: Skip this many results (paging beyond limit; OLX caps the window at 1000)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [relevance, price_asc, price_desc, newest]
 *           default: relevance
 *         description: Sort order (promoted ads stay pinned first)
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
 *         description: Only listings with OLX delivery
 *       - in: query
 *         name: condition
 *         schema:
 *           type: string
 *           enum: [new, used, damaged]
 *         description: Item condition
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Numeric category id (e.g. 99 = Elektronika, includes subcategories) or category slug (e.g. elektronika)
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name, slug or numeric id (e.g. Kraków) — names are resolved automatically
 *       - in: query
 *         name: distance
 *         schema:
 *           type: integer
 *           maximum: 100
 *         description: Search radius in km around the city (requires city)
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Region/voivodeship name, slug or id; ignored when city is set
 *     responses:
 *       200:
 *         description: Search results (see SearchResponse schema — totalCount is capped at 1000 by OLX, visibleTotalCount is the real total, source shows which extraction path was used)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResponse'
 *       400:
 *         description: Invalid query parameters (Zod issues included)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: OLX response no longer matches the expected format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: OLX blocked the request (retryable)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:query', async (req: Request, res: Response) => {
  const parsed = SearchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues });
  }

  try {
    const response = await searchListings(req.params.query, parsed.data);
    res.json(response);
  } catch (err) {
    sendError(res, err, 'search results');
  }
});

export default router;
