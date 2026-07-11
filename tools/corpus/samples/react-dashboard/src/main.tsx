import { createRoot } from "react-dom/client";
import { SalesChart } from "./panels/SalesChart.js";

const root = createRoot(document.getElementById("root")!);
root.render(<SalesChart points={[]} />);
