export interface SearchResult {
  id: string;
  title: string;
  price: string;
  location: string;
  date: string;
  hasDelivery: boolean;
  url: string;
}

export interface SearchResponse {
  totalCount: number;
  page: number;
  results: SearchResult[];
}

export interface ProductDetail {
  id: string;
  title: string;
  description: string;
  price: string;
  negotiable: boolean;
  parameters: Record<string, string>;
  photos: string[];
  location: string;
  postedAt: string;
  seller: {
    name: string;
    memberSince: string;
  };
  url: string;
}

export interface Category {
  name: string;
  slug: string;
  url: string;
  count?: string;
}
