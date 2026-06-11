import { Router, Request, Response } from 'express';
import { getSellerListings } from '../services/olx';
import { sendError } from '../utils/errors';

const router = Router();

/**
 * @openapi
 * /olx/v1/seller/{id}/listings:
 *   get:
 *     tags: [Seller]
 *     summary: List a seller's active listings
 *     description: >
 *       All active listings from one seller, by the numeric seller id found
 *       in search/product results (`seller.id`). Useful for checking a
 *       seller's track record or finding bundles.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Numeric OLX user id
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 40
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Seller's listings (same shape as search results)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SellerListingsResult'
 *       400:
 *         description: Invalid seller id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/listings', async (req: Request, res: Response) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Seller id must be numeric' });
  }
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 40));

  try {
    res.json(await getSellerListings(req.params.id, limit));
  } catch (err) {
    sendError(res, err, 'seller listings');
  }
});

export default router;
