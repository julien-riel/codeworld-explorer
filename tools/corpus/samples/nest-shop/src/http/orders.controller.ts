import { Controller, Get, Post } from "@nestjs/common";
import { PricingService } from "../billing/pricing.service.js";
import { OrderRepository } from "../persistence/order.repository.js";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly pricing: PricingService,
    private readonly orders: OrderRepository,
  ) {}

  @Get()
  list(): string[] {
    return this.orders.all().map((o) => o.id);
  }

  @Post()
  create(): number {
    return this.pricing.quote(100);
  }
}
