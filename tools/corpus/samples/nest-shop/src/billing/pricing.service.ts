import { Injectable } from "@nestjs/common";
import { TaxService } from "./tax.service.js";

@Injectable()
export class PricingService {
  constructor(private readonly tax: TaxService) {}

  quote(amount: number): number {
    return amount + this.tax.on(amount);
  }
}
