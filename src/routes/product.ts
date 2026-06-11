import { Router, Request, Response } from 'express';
import { getProduct } from '../services/olx';
import { ProductDetail } from '../schemas';
import { sendError } from '../utils/errors';

const router = Router();

function productEndpoint(
  what: string,
  pick: (product: ProductDetail) => object,
) {
  return async (req: Request, res: Response) => {
    try {
      const product = await getProduct(req.params.id);
      if (!product || !product.title) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(pick(product));
    } catch (err) {
      sendError(res, err, what);
    }
  };
}

/**
 * @openapi
 * /olx/v1/product/{id}:
 *   get:
 *     tags: [Product]
 *     summary: Get product details by OLX ad ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: OLX ad ID (numeric, e.g. 1052407977)
 *     responses:
 *       200:
 *         description: Full product details (structured price, ISO dates, full description and photo set)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductDetail'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: OLX response no longer matches the expected format
 *       503:
 *         description: OLX blocked the request (retryable)
 */
router.get('/:id', productEndpoint('product details', (p) => p));

/**
 * @openapi
 * /olx/v1/product/{id}/photos:
 *   get:
 *     tags: [Product — Partial]
 *     summary: Get product photos
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of full-resolution photo URLs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 photos:
 *                   type: array
 *                   items: { type: string }
 *       404:
 *         description: Product not found
 */
router.get('/:id/photos', productEndpoint('product photos', (p) => ({ id: p.id, photos: p.photos })));

/**
 * @openapi
 * /olx/v1/product/{id}/price:
 *   get:
 *     tags: [Product — Partial]
 *     summary: Get product price
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Structured price (numeric value, currency, display string, negotiable flag, previousValue when the price was lowered)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 price: { $ref: '#/components/schemas/Price' }
 *       404:
 *         description: Product not found
 */
router.get('/:id/price', productEndpoint('product price', (p) => ({ id: p.id, price: p.price })));

/**
 * @openapi
 * /olx/v1/product/{id}/seller:
 *   get:
 *     tags: [Product — Partial]
 *     summary: Get seller info
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seller id (usable with /olx/v1/seller/{id}/listings), name and member-since date
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 seller: { $ref: '#/components/schemas/Seller' }
 *       404:
 *         description: Product not found
 */
router.get('/:id/seller', productEndpoint('seller info', (p) => ({ id: p.id, seller: p.seller })));

/**
 * @openapi
 * /olx/v1/product/{id}/description:
 *   get:
 *     tags: [Product — Partial]
 *     summary: Get product description and parameters
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full description text, normalized condition, and listing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 description: { type: string }
 *                 condition: { type: string, nullable: true }
 *                 parameters:
 *                   type: object
 *                   additionalProperties: { type: string }
 *       404:
 *         description: Product not found
 */
router.get('/:id/description', productEndpoint('product description', (p) => ({
  id: p.id,
  description: p.description,
  condition: p.condition,
  parameters: p.parameters,
})));

export default router;
