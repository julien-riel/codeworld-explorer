export class Order {
  constructor(
    public readonly id: string,
    public readonly lines: readonly OrderLine[],
  ) {}
}

export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
}
