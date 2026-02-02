import { Router, Request, Response } from 'express';
import { fetchPage } from '../scrapers/fetcher';
import { parseProductFromApi } from '../scrapers/productParser';
import { ProductDetail } from '../types';

const router = Router();

async function fetchProduct(id: string): Promise<ProductDetail | null> {
  const apiUrl = `https://www.olx.pl/api/v1/offers/${id}/`;
  const json = await fetchPage(apiUrl);
  const data = JSON.parse(json);
  if (!data?.data?.id) return null;
  return parseProductFromApi(data.data);
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
 *         description: Full product details
 *       404:
 *         description: Product not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product || !product.title) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err: any) {
    console.error('Product error:', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Failed to fetch product details', details: err.message });
  }
});

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
 *       404:
 *         description: Product not found
 */
router.get('/:id/photos', async (req: Request, res: Response) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ id: product.id, photos: product.photos });
  } catch (err: any) {
    console.error('Product photos error:', err.message);
    if (err.response?.status === 404) return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Failed to fetch product photos', details: err.message });
  }
});

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
 *         description: Price and negotiability info
 *       404:
 *         description: Product not found
 */
router.get('/:id/price', async (req: Request, res: Response) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ id: product.id, price: product.price, negotiable: product.negotiable });
  } catch (err: any) {
    console.error('Product price error:', err.message);
    if (err.response?.status === 404) return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Failed to fetch product price', details: err.message });
  }
});

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
 *         description: Seller name and member since date
 *       404:
 *         description: Product not found
 */
router.get('/:id/seller', async (req: Request, res: Response) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ id: product.id, seller: product.seller });
  } catch (err: any) {
    console.error('Product seller error:', err.message);
    if (err.response?.status === 404) return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Failed to fetch seller info', details: err.message });
  }
});

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
 *         description: Description text and listing parameters
 *       404:
 *         description: Product not found
 */
router.get('/:id/description', async (req: Request, res: Response) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ id: product.id, description: product.description, parameters: product.parameters });
  } catch (err: any) {
    console.error('Product description error:', err.message);
    if (err.response?.status === 404) return res.status(404).json({ error: 'Product not found' });
    res.status(500).json({ error: 'Failed to fetch product description', details: err.message });
  }
});

export default router;
