export interface CatalogItem {
  readonly id: string;
  readonly title: string;
}

export class CatalogService {
  async fetchItems(): Promise<CatalogItem[]> {
    const response = await fetch("/api/catalog");
    return (await response.json()) as CatalogItem[];
  }
}
