import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { parseCategoryTree, searchCategoryTree } from '../src/scrapers/categoryTree';
import { CategoryNodeSchema } from '../src/schemas';

const html = readFileSync(join(__dirname, 'fixtures', 'categories-prerendered.html'), 'utf-8');

describe('parseCategoryTree', () => {
  const tree = parseCategoryTree(html)!;

  it('extracts the tree with schema-valid nodes', () => {
    expect(tree).not.toBeNull();
    expect(tree.length).toBeGreaterThan(300);
    for (const node of tree.slice(0, 20)) {
      const check = CategoryNodeSchema.safeParse(node);
      expect(check.success, JSON.stringify(check.success ? null : check.error.issues)).toBe(true);
    }
  });

  it('preserves parent/child links and slug paths', () => {
    const elektronika = tree.find((c) => c.id === 99)!;
    expect(elektronika.name).toBe('Elektronika');
    expect(elektronika.level).toBe(1);
    expect(elektronika.children.length).toBeGreaterThan(0);

    const child = tree.find((c) => c.id === elektronika.children[0])!;
    expect(child.parentId).toBe(99);
    expect(child.path.startsWith('elektronika/')).toBe(true);
  });

  it('returns null on pages without the tree', () => {
    expect(parseCategoryTree('<html><body>nope</body></html>')).toBeNull();
  });
});

describe('searchCategoryTree', () => {
  const tree = parseCategoryTree(html)!;

  it('finds electric guitars from a diacritic-free query', () => {
    const matches = searchCategoryTree(tree, 'gitary elektryczne', 5);
    expect(matches[0].id).toBe(4558);
    expect(matches[0].path).toBe('muzyka-edukacja/instrumenty/gitary/gitary-elektryczne');
  });

  it('ranks exact/prefix matches before substring matches', () => {
    const matches = searchCategoryTree(tree, 'gitary', 10);
    expect(matches[0].name.toLowerCase()).toBe('gitary');
    expect(matches.length).toBeGreaterThan(1);
  });

  it('matches Polish names case-insensitively', () => {
    const matches = searchCategoryTree(tree, 'LAPTOPY', 5);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].path).toContain('laptopy');
  });
});
