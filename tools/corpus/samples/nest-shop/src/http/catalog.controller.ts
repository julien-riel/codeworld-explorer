import { Controller, Get } from "@nestjs/common";
import { Product } from "../domain/product.js";

@Controller("catalog")
export class CatalogController {
  @Get()
  list(): Product[] {
    return [];
  }
}
