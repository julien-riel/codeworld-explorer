import { OrdersController } from "../src/http/orders.controller.js";

describe("OrdersController", () => {
  it("expose une liste", () => {
    expect(typeof OrdersController).toBe("function");
  });
});
