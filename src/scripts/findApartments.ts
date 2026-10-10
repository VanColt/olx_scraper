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
  maxTotalMonthlyCost: z.number().nonnegative().optional(),
  oneRoomRequiresSeparateKitchen: z.boolean().default(false),
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
  link: string;
  extracted: ApartmentFacts & { totalMonthlyCost: number | null };
  validation: ApartmentFactsValidation;
}

export interface ApartmentFacts {
  areaM2: number | null;
  rooms: number | null;
  additionalFees: number | null;
}

export interface ApartmentFactsValidation {
  parameters: ApartmentFacts;
  description: ApartmentFacts;
  sources: Record<keyof ApartmentFacts, 'description' | 'parameters' | 'missing'>;
  discrepancies: Array<{
    field: keyof ApartmentFacts;
    parameterValue: number;
    descriptionValue: number;
  }>;
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
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l');
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

function extractParameterFacts(product: ProductDetail): ApartmentFacts {
  const area = parameter(product, [/^powierzchnia$/, /powierzchnia.*mieszkania/]);
  const rooms = parameter(product, [/liczba pokoi/, /^pokoje$/]);
  const fees = parameter(product, [/^czynsz\b/, /oplaty dodatkowe/, /dodatkowe oplaty/]);
  return {
    areaM2: parsePolishNumber(area),
    rooms: parsePolishNumber(rooms),
    additionalFees: parsePolishNumber(fees),
  };
}

function firstNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return parsePolishNumber(match[1]);
  }
  return null;
}

function extractDescriptionFacts(product: ProductDetail): ApartmentFacts {
  const title = normalize(product.title);
  const description = normalize(product.description);
  // The description is authoritative, so its first explicit value wins;
  // the title is only a fallback when the description omits the field.
  const combined = `${description}\n${title}`;

  const areaM2 = firstNumber(combined, [
    /(?:powierzchnia|metraz)(?:\s+mieszkania)?[^\d]{0,30}(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:2|²)(?![a-z0-9])/,
    /\bmieszkanie[^\n\d]{0,50}(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:2|²)(?![a-z0-9])/,
    /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:2|²)(?![a-z0-9])[^\n]{0,40}\bmieszkanie\b/,
    /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:2|²)(?![a-z0-9])/,
  ]);

  const roomNumberPatterns = [
    /liczba\s+pokoi[^\d]{0,20}(\d{1,2})\b/,
    /\b(\d{1,2})\s*[- ]?pokoj(?:owe|owy|owa|owym|owego|e|i|ach|u)?\b/,
  ];
  const roomWords: Array<[RegExp, number]> = [
    [/\b(?:kawalerka|jednopokoj\w*|jeden\s+pokoj)\b/, 1],
    [/\bdwupokoj\w*\b/, 2],
    [/\btrzypokoj\w*\b/, 3],
    [/\bczteropokoj\w*\b/, 4],
    [/\bpieciopokoj\w*\b/, 5],
  ];
  let rooms = firstNumber(description, roomNumberPatterns);
  if (rooms === null) {
    rooms = roomWords.find(([pattern]) => pattern.test(description))?.[1] ?? null;
  }
  if (rooms === null) rooms = firstNumber(title, roomNumberPatterns);
  if (rooms === null) rooms = roomWords.find(([pattern]) => pattern.test(title))?.[1] ?? null;

  let additionalFees = firstNumber(combined, [
    /(?:czynsz\s+administracyjny|oplaty?\s+administracyjne|czynsz\s+do\s+wspolnoty|czynsz\s+dodatkowo)[^\d]{0,40}(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:zl|pln)\b/,
    /\b(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:zl|pln)\b[^\n]{0,30}(?:czynszu\s+administracyjnego|oplat\s+administracyjnych)\b/,
    /\bczynsz(?!\s+(?:najmu|za\s+najem))[^\d\n]{0,30}(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:zl|pln)\b/,
  ]);
  if (additionalFees === null && /(?:bezczynszow|bez\s+dodatkowych\s+oplat|wszystkie\s+oplaty\s+w\s+cenie|czynsz\s+w\s+cenie)/.test(combined)) {
    additionalFees = 0;
  }

  return { areaM2, rooms, additionalFees };
}

export function validateApartmentFacts(product: ProductDetail): ApartmentFactsValidation {
  const parameters = extractParameterFacts(product);
  const description = extractDescriptionFacts(product);
  const fields: Array<keyof ApartmentFacts> = ['areaM2', 'rooms', 'additionalFees'];
  const sources = {} as ApartmentFactsValidation['sources'];
  const discrepancies: ApartmentFactsValidation['discrepancies'] = [];

  for (const field of fields) {
    const parameterValue = parameters[field];
    const descriptionValue = description[field];
    sources[field] = descriptionValue !== null
      ? 'description'
      : parameterValue !== null ? 'parameters' : 'missing';
    if (parameterValue !== null && descriptionValue !== null && Math.abs(parameterValue - descriptionValue) > 0.01) {
      discrepancies.push({ field, parameterValue, descriptionValue });
    }
  }

  return { parameters, description, sources, discrepancies };
}

export function extractApartmentFacts(product: ProductDetail): ApartmentFacts {
  const validation = validateApartmentFacts(product);
  return {
    areaM2: validation.description.areaM2 ?? validation.parameters.areaM2,
    rooms: validation.description.rooms ?? validation.parameters.rooms,
    additionalFees: validation.description.additionalFees ?? validation.parameters.additionalFees,
  };
}

function hasSeparateKitchen(product: ProductDetail): boolean {
  const text = normalize([
    product.title,
    product.description,
    ...Object.entries(product.parameters).flat(),
  ].join(' '));
  return [
    /(?:oddzieln|osobn|niezalezn|zamkniet)\w*\s+kuchni\w*/,
    /kuchni\w*\s+(?:oddzieln|osobn|niezalezn|zamkniet)\w*/,
    /\b1\s+pokoj\w*[^.\n]{0,80}\b(?:i|oraz)\s+kuchni\w*/,
    /\bpokoj\w*[^.\n]{0,100}\bkuchni\w*/,
    /\bkuchni\w*[^.\n]{0,100}\bpokoj\w*/,
  ].some((pattern) => pattern.test(text));
}

function totalMonthlyCost(product: ProductDetail, facts: ApartmentFacts): number | null {
  if (product.price.value === null || facts.additionalFees === null) return null;
  return product.price.value + facts.additionalFees;
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
  const totalCost = totalMonthlyCost(product, facts);
  if (criteria.maxTotalMonthlyCost !== undefined &&
      (totalCost === null || totalCost > criteria.maxTotalMonthlyCost)) return false;
  if (facts.rooms === 1 && criteria.oneRoomRequiresSeparateKitchen && !hasSeparateKitchen(product)) return false;
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
  if (criteria.sort === 'newest') {
    matches.sort((a, b) => Date.parse(b.postedAt || '') - Date.parse(a.postedAt || ''));
  }
  const results = matches
    .slice(0, criteria.resultLimit)
    .map((product) => {
      const facts = extractApartmentFacts(product);
      return {
        ...product,
        link: product.url,
        extracted: { ...facts, totalMonthlyCost: totalMonthlyCost(product, facts) },
        validation: validateApartmentFacts(product),
      };
    });

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
