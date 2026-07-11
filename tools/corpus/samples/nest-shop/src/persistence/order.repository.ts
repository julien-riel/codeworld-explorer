import { Order } from "../models/order.entity.js";

export class OrderRepository {
  private readonly store: Order[] = [];

  all(): Order[] {
    return this.store;
  }

  save(order: Order): void {
    this.store.push(order);
  }
}
