import 'dotenv/config';
import path from 'path';
import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import { apiReference } from '@scalar/express-api-reference';
import searchRouter from './routes/search';
import productRouter from './routes/product';
import categoriesRouter from './routes/categories';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OLX.pl Scraper API',
      version: '1.0.0',
      description: '<img src="/olx/v1/logo.png" width="120" style="filter: brightness(0) invert(1);" />\n\nUnofficial API for searching and retrieving listings from OLX.pl',
      'x-logo': {
        url: '/olx/v1/logo.png',
        altText: 'OLX Scraper API',
      },
    },
    servers: [{ url: `http://localhost:${port}` }],
    tags: [
      { name: 'Search', description: 'Search OLX listings with filters and auto-pagination' },
      { name: 'Product', description: 'Retrieve full product details by ID' },
      { name: 'Product — Partial', description: 'Retrieve specific parts of a product listing' },
      { name: 'Categories', description: 'Browse available OLX categories' },
    ],
  },
  apis: ['./src/routes/*.ts'],
});

app.use('/olx/v1', express.static(path.join(__dirname, '..', 'public')));
app.get('/olx/v1/docs.json', (_req, res) => res.json(swaggerSpec));

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
    operationsSorter: 'alpha',
    withDefaultFonts: true,
    metadata: {
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
app.use('/olx/v1/categories', categoriesRouter);

app.get('/', (_req, res) => {
  res.redirect('/olx/v1/docs');
});

app.listen(port, () => {
  console.log(`OLX Scraper API running on http://localhost:${port}`);
  console.log(`API docs: http://localhost:${port}/olx/v1/docs`);
});
