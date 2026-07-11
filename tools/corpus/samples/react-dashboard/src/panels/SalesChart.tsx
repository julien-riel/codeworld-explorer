import { useMemo } from "react";

export interface SalesPoint {
  readonly label: string;
  readonly value: number;
}

export function SalesChart({ points }: { points: SalesPoint[] }) {
  const total = useMemo(() => points.reduce((sum, p) => sum + p.value, 0), [points]);
  return <div className="sales-chart">Total : {total}</div>;
}
