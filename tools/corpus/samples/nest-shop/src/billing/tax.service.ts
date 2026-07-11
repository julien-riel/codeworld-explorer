import { Injectable } from "@nestjs/common";

const RATE = 0.2;

@Injectable()
export class TaxService {
  on(amount: number): number {
    return Math.round(amount * RATE);
  }
}
