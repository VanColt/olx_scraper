import 'dotenv/config';
import path from 'path';
import express from 'express';
import { apiReference } from '@scalar/express-api-reference';
import { buildSwaggerSpec } from './docs/spec';
import searchRouter from './routes/search';
import productRouter from './routes/product';
import productsRouter from './routes/products';
import categoriesRouter from './routes/categories';
import locationsRouter from './routes/locations';
import sellerRouter from './routes/seller';
import messagingRouter from './routes/messaging';
import { closeBrowser } from './scrapers/fetcher';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

const swaggerSpec = buildSwaggerSpec();

app.use('/olx/v1', express.static(path.join(__dirname, '..', 'public')));
app.get('/olx/v1/docs.json', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const spec = {
    ...swaggerSpec,
    servers: [{ url: `${protocol}://${host}`, description: 'Current' }],
  };
  res.json(spec);
});

app.use(
  '/olx/v1/docs',
  apiReference({
    spec: { url: '/olx/v1/docs.json' },
    layout: 'modern',
    theme: 'default',
    defaultOpenAllTags: true,
    hideClientButton: true,
    hideDarkModeToggle: true,
    showSidebar: true,
    withDefaultFonts: true,
    metaData: {
      title: 'OLX.pl Scraper API',
    },
    customCss: `
      .introduction-description img {
        width: 120px !important;
        height: auto !important;
        filter: brightness(0) invert(1);
      }
    `,
    favicon: '/olx/v1/logo.png',
  }),
);

app.use('/olx/v1/search', searchRouter);
app.use('/olx/v1/product', productRouter);
app.use('/olx/v1/products', productsRouter);
app.use('/olx/v1/categories', categoriesRouter);
app.use('/olx/v1/locations', locationsRouter);
app.use('/olx/v1/seller', sellerRouter);
app.use('/olx/v1/messaging', messagingRouter);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Meta]
 *     summary: Liveness check
 *     responses:
 *       200:
 *         description: Service is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 uptime: { type: number, example: 123.45 }
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/', (_req, res) => {
  res.redirect('/olx/v1/docs');
});

const server = app.listen(port, () => {
  console.log(`OLX Scraper API running on http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/olx/v1/docs`);
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
