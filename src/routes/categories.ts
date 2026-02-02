import { Router, Request, Response } from 'express';
import { fetchPage } from '../scrapers/fetcher';
import * as cheerio from 'cheerio';
import { Category } from '../types';

const router = Router();

/**
 * @openapi
 * /olx/v1/categories:
 *   get:
 *     tags: [Categories]
 *     summary: Get available OLX categories
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const html = await fetchPage('https://www.olx.pl/');
    const $ = cheerio.load(html);
    const categories: Category[] = [];

    $('[data-testid^="cat-"]').each((_, el) => {
      const a = $(el);
      if (a.is('a')) {
        const href = a.attr('href') || '';
        const name = a.find('p').text().trim() || a.text().trim();
        const slug = href.replace(/^\//, '').replace(/\/$/, '');
        if (name && slug) {
          categories.push({
            name,
            slug,
            url: href.startsWith('http') ? href : `https://www.olx.pl${href}`,
          });
        }
      }
    });

    res.json(categories);
  } catch (err: any) {
    console.error('Categories error:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
  }
});

export default router;
