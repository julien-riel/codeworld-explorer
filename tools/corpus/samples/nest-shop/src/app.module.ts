import { Module } from "@nestjs/common";
import { OrdersController } from "./http/orders.controller.js";
import { CatalogController } from "./http/catalog.controller.js";
import { PricingService } from "./billing/pricing.service.js";
import { TaxService } from "./billing/tax.service.js";

@Module({
  controllers: [OrdersController, CatalogController],
  providers: [PricingService, TaxService],
})
export class AppModule {}
