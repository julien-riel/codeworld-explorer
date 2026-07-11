import { useState } from "react";

export interface UserRow {
  readonly id: string;
  readonly name: string;
}

export function UserTable({ rows }: { rows: UserRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <table onClick={() => setSelected(rows[0]?.id ?? null)}>
      <tbody>
        <tr>
          <td>{selected ?? "aucun"}</td>
        </tr>
      </tbody>
    </table>
  );
}
