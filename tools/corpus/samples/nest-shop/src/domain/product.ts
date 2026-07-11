export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly priceCents: number;
}

export function isInStock(product: Product, stock: ReadonlyMap<string, number>): boolean {
  return (stock.get(product.sku) ?? 0) > 0;
}
