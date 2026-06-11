import { Router, Request, Response } from 'express';
import { getProducts } from '../services/olx';
import { sendError } from '../utils/errors';

const router = Router();

const MAX_BATCH = 20;

/**
 * @openapi
 * /olx/v1/products:
 *   get:
 *     tags: [Product]
 *     summary: Get multiple products by id in one call
 *     description: >
 *       Batch variant of /olx/v1/product/{id} for checking a shortlist of
 *       listings. Up to 20 ids per call; upstream requests are rate-limited
 *       sequentially, cached products return instantly. Returns found
 *       products plus which ids were not found or failed.
 *     parameters:
 *       - in: query
 *         name: ids
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated numeric ad ids, e.g. ids=1078034151,1078063271
 *     responses:
 *       200:
 *         description: Products, notFound ids and failed ids
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchProductsResult'
 *       400:
 *         description: Missing or invalid ids
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req: Request, res: Response) => {
  const raw = String(req.query.ids || '');
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Provide ?ids= as a comma-separated list of ad ids' });
  }
  if (ids.length > MAX_BATCH) {
    return res.status(400).json({ error: `At most ${MAX_BATCH} ids per request (got ${ids.length})` });
  }
  if (ids.some((id) => !/^\d+$/.test(id))) {
    return res.status(400).json({ error: 'All ids must be numeric' });
  }

  try {
    res.json(await getProducts(ids));
  } catch (err) {
    sendError(res, err, 'products');
  }
});

export default router;
