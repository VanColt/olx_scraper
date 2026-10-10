import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { ProductDetail, SearchQuery } from '../schemas';
import { getProducts, searchListings } from '../services/olx';
import { closeBrowser } from '../scrapers/fetcher';

const CriteriaSchema = z.object({
  mode: z.enum(['rent', 'sale']).default('rent'),
  city: z.string().min(1).default('Gdańsk'),
  distance: z.number().int().min(0).max(100).default(0),
  query: z.string().default('mieszkanie'),
  categoryId: z.number().int().positive().optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  minArea: z.number().nonnegative().optional(),
  maxArea: z.number().nonnegative().optional(),
  rooms: z.array(z.number().int().positive()).optional(),
  maxAdditionalFees: z.number().nonnegative().optional(),
  districts: z.array(z.string().min(1)).default([]),
  requiredPhrases: z.array(z.string().min(1)).default([]),
  excludedPhrases: z.array(z.string().min(1)).default([]),
  privateOnly: z.boolean().default(false),
  searchLimit: z.number().int().min(1).max(200).default(100),
  resultLimit: z.number().int().min(1).max(200).default(30),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).default('newest'),
}).strict();

export type ApartmentCriteria = z.infer<typeof CriteriaSchema>;

export interface ApartmentResult extends ProductDetail {
  extracted: {
    areaM2: number | null;
    rooms: number | null;
    additionalFees: number | null;
  };
}

export interface ApartmentSearchOutput {
  generatedAt: string;
  criteria: ApartmentCriteria;
  categoryId: number;
  inspectedCount: number;
  matchedCount: number;
  unavailableIds: string[];
  failed: { id: string; error: string }[];
  results: ApartmentResult[];
}

const DEFAULT_CRITERIA: ApartmentCriteria = CriteriaSchema.parse({});

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl-PL');
}

function parsePolishNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/\s/g, '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parameter(product: ProductDetail, names: RegExp[]): string | undefined {
  const entry = Object.entries(product.parameters).find(([key]) => {
    const normalized = normalize(key);
    return names.some((name) => name.test(normalized));
  });
  return entry?.[1];
}

export function extractApartmentFacts(product: ProductDetail): ApartmentResult['extracted'] {
  const area = parameter(product, [/^powierzchnia$/, /powierzchnia.*mieszkania/]);
  const rooms = parameter(product, [/liczba pokoi/, /^pokoje$/]);
  const fees = parameter(product, [/^czynsz\b/, /oplaty dodatkowe/, /dodatkowe oplaty/]);
  return {
    areaM2: parsePolishNumber(area),
    rooms: parsePolishNumber(rooms),
    additionalFees: parsePolishNumber(fees),
  };
}

function isInRange(value: number | null, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === null) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

export function matchesCriteria(product: ProductDetail, criteria: ApartmentCriteria): boolean {
  const facts = extractApartmentFacts(product);
  if (!isInRange(product.price.value, criteria.minPrice, criteria.maxPrice)) return false;
  if (!isInRange(facts.areaM2, criteria.minArea, criteria.maxArea)) return false;
  if (criteria.rooms?.length && (facts.rooms === null || !criteria.rooms.includes(facts.rooms))) return false;
  if (criteria.maxAdditionalFees !== undefined &&
      (facts.additionalFees === null || facts.additionalFees > criteria.maxAdditionalFees)) return false;
  if (criteria.privateOnly && product.isBusiness) return false;

  const haystack = normalize([
    product.title,
    product.description,
    product.location,
    ...Object.entries(product.parameters).flat(),
  ].join(' '));
  if (criteria.districts.length && !criteria.districts.some((item) => haystack.includes(normalize(item)))) return false;
  if (criteria.requiredPhrases.some((item) => !haystack.includes(normalize(item)))) return false;
  if (criteria.excludedPhrases.some((item) => haystack.includes(normalize(item)))) return false;
  return true;
}

function resolveApartmentCategory(criteria: ApartmentCriteria): number {
  if (criteria.categoryId !== undefined) return criteria.categoryId;
  // Stabilne identyfikatory API OLX: Mieszkania/Sprzedaż i Mieszkania/Wynajem.
  // categoryId w konfiguracji pozwala zareagować bez zmiany kodu, jeśli OLX je zmieni.
  return criteria.mode === 'rent' ? 15 : 14;
}

async function fetchDetails(ids: string[]) {
  const products: ProductDetail[] = [];
  const notFound: string[] = [];
  const failed: { id: string; error: string }[] = [];

  // Publiczny endpoint ogranicza partię do 20; zachowujemy ten sam, łagodny rytm.
  for (let index = 0; index < ids.length; index += 20) {
    const end = Math.min(index + 20, ids.length);
    console.error(`Pobieranie pełnych opisów: ${index + 1}-${end} z ${ids.length}...`);
    const batch = await getProducts(ids.slice(index, end));
    products.push(...batch.products);
    notFound.push(...batch.notFound);
    failed.push(...batch.failed);
  }
  console.error(`Pobrano szczegóły ${products.length} ofert.`);
  return { products, notFound, failed };
}

export async function findApartments(rawCriteria: unknown): Promise<ApartmentSearchOutput> {
  const criteria = CriteriaSchema.parse(rawCriteria);
  const categoryId = resolveApartmentCategory(criteria);
  const searchQuery: SearchQuery = {
    limit: criteria.searchLimit,
    offset: 0,
    sort: criteria.sort,
    min_price: criteria.minPrice,
    max_price: criteria.maxPrice,
    category: String(categoryId),
    city: criteria.city,
    distance: criteria.distance,
  };

  const search = await searchListings(criteria.query, searchQuery);
  const details = await fetchDetails(search.results.map((item) => item.id));
  const matches = details.products.filter((product) => matchesCriteria(product, criteria));
  const results = matches
    .slice(0, criteria.resultLimit)
    .map((product) => ({ ...product, extracted: extractApartmentFacts(product) }));

  return {
    generatedAt: new Date().toISOString(),
    criteria,
    categoryId,
    inspectedCount: details.products.length,
    matchedCount: matches.length,
    unavailableIds: details.notFound,
    failed: details.failed,
    results,
  };
}

function parseArgs(argv: string[]): { configPath?: string; outputPath?: string } {
  const args: { configPath?: string; outputPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') args.configPath = argv[++i];
    else if (argv[i] === '--output') args.outputPath = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Użycie: npm run find:apartments -- [--config apartments.config.json] [--output wyniki.json]');
      process.exit(0);
    } else throw new Error(`Nieznany argument: ${argv[i]}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const defaultPath = resolve('apartments.config.json');
  const configPath = args.configPath ? resolve(args.configPath) : defaultPath;
  const raw = existsSync(configPath)
    ? { ...DEFAULT_CRITERIA, ...JSON.parse(readFileSync(configPath, 'utf8')) }
    : DEFAULT_CRITERIA;
  const output = await findApartments(raw);
  const json = JSON.stringify(output, null, 2) + '\n';

  if (args.outputPath) {
    const outputPath = resolve(args.outputPath);
    writeFileSync(outputPath, json, 'utf8');
    console.error(`Zapisano ${output.matchedCount} ofert do ${outputPath}`);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      if (error instanceof z.ZodError) {
        console.error('Nieprawidłowa konfiguracja:', z.prettifyError(error));
      } else {
        console.error(error instanceof Error ? error.message : error);
      }
      process.exitCode = 1;
    })
    .finally(closeBrowser);
}
