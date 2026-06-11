import { Router, Request, Response } from 'express';
import { getCategories, findCategories } from '../services/olx';
import { sendError } from '../utils/errors';

const router = Router();

/**
 * @openapi
 * /olx/v1/categories/tree:
 *   get:
 *     tags: [Categories]
 *     summary: Find categories in the full OLX category tree
 *     description: >
 *       Searches all ~3100 OLX categories (4 levels deep) by name fragment
 *       and/or parent id. Returns ids usable as the search `category` filter,
 *       with full paths like "muzyka-edukacja/instrumenty/gitary". Matching
 *       is case- and diacritic-insensitive ("gitary" finds "Gitary").
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Name fragment to search for (e.g. "gitary elektryczne")
 *       - in: query
 *         name: parent_id
 *         schema:
 *           type: integer
 *         description: List children of this category (0 = top level)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Matching category nodes (id, name, path, parentId, level, children)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CategoryNode'
 */
router.get('/tree', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || undefined;
  const parentIdRaw = req.query.parent_id as string | undefined;
  const parentId = parentIdRaw !== undefined ? parseInt(parentIdRaw, 10) : undefined;
  if (parentIdRaw !== undefined && !Number.isInteger(parentId)) {
    return res.status(400).json({ error: 'parent_id must be an integer' });
  }
  const limit = parseInt(req.query.limit as string, 10) || 20;

  try {
    res.json(await findCategories({ query, parentId, limit }));
  } catch (err) {
    sendError(res, err, 'category tree');
  }
});

/**
 * @openapi
 * /olx/v1/categories:
 *   get:
 *     tags: [Categories]
 *     summary: Get top-level OLX categories
 *     description: The 19 top-level categories. Use /olx/v1/categories/tree to search all ~3100 subcategories.
 *     responses:
 *       200:
 *         description: List of top-level categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Category'
 *       502:
 *         description: OLX response no longer matches the expected format
 *       503:
 *         description: OLX blocked the request (retryable)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await getCategories());
  } catch (err) {
    sendError(res, err, 'categories');
  }
});

export default router;
