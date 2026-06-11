import { CategoryNode } from '../schemas';

/**
 * Every OLX page embeds the complete category tree (~3100 nodes, 4 levels)
 * in its prerendered state under `categories.list` — a flat id→node map
 * with parent/children links and full slug paths.
 */
export function parseCategoryTree(html: string): CategoryNode[] | null {
  const marker = 'window.__PRERENDERED_STATE__= "';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const start = idx + marker.length - 1;
  let end = html.indexOf('";\n', start);
  if (end === -1) end = html.indexOf('";', start);
  if (end === -1) return null;

  try {
    const inner = JSON.parse(html.substring(start, end + 1));
    const data = typeof inner === 'string' ? JSON.parse(inner) : inner;
    const list = data?.categories?.list;
    if (!list || typeof list !== 'object') return null;

    const nodes: CategoryNode[] = [];
    for (const raw of Object.values<any>(list)) {
      if (raw?.id == null) continue;
      nodes.push({
        id: raw.id,
        name: raw.name || '',
        slug: raw.normalizedName || '',
        path: raw.path || '',
        parentId: raw.parentId ?? 0,
        level: raw.level ?? 0,
        children: Array.isArray(raw.children) ? raw.children : [],
      });
    }
    return nodes.length > 0 ? nodes : null;
  } catch {
    return null;
  }
}

const DIACRITICS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => DIACRITICS[c] || c);
}

/** Match categories by name/slug fragment (case- and diacritic-insensitive). */
export function searchCategoryTree(nodes: CategoryNode[], query: string, limit: number): CategoryNode[] {
  const q = normalize(query.trim());
  if (!q) return [];

  const scored = nodes
    .map((node) => {
      const name = normalize(node.name);
      const slug = node.slug;
      let score = -1;
      if (name === q || slug === q) score = 0;
      else if (name.startsWith(q) || slug.startsWith(q)) score = 1;
      else if (name.includes(q) || slug.includes(q) || node.path.includes(q)) score = 2;
      return { node, score };
    })
    .filter((s) => s.score >= 0);

  scored.sort((a, b) => a.score - b.score || a.node.level - b.node.level);
  return scored.slice(0, limit).map((s) => s.node);
}
