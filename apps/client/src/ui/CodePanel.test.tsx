// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useWorldStore } from "../state/store";
import { CodePanel } from "./CodePanel";
import { HASH_A, IDS, loadWorldIntoStore, makeWorld, resetStore } from "./testkit";

// Monaco est MOQUÉ : on ne teste pas son rendu réel, seulement le câblage (valeur,
// lecture seule). On moque le module chargé en `lazy` par le CodePanel (`./monacoEditor`,
// qui sert Monaco depuis le bundle) : l'import différé résout vers ce stub, sans tirer le
// vrai `monaco-editor` (workers, APIs navigateur) inutilisable sous jsdom.
vi.mock("./monacoEditor", () => ({
  default: (props: { value?: string; options?: { readOnly?: boolean } }) => (
    <div data-testid="monaco" data-readonly={String(props.options?.readOnly ?? false)}>
      {props.value}
    </div>
  ),
}));

const CONTENT = "export const x = 1;\n";

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(CONTENT) }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  resetStore();
  vi.unstubAllGlobals();
});

describe("CodePanel", () => {
  it("demande le contenu à la bonne URL (worlds/<base>/files/<contentHash>)", async () => {
    const fetchMock = stubFetch();
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    useWorldStore.setState({ selectedFileNodeId: IDS.fileA, codePanelOpen: true });

    render(<CodePanel />);
    await screen.findByTestId("monaco");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`worlds/schema/files/${HASH_A}`);
  });

  it("affiche le contenu chargé dans un éditeur en LECTURE SEULE", async () => {
    stubFetch();
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    useWorldStore.setState({ selectedFileNodeId: IDS.fileA, codePanelOpen: true });

    render(<CodePanel />);
    const editor = await screen.findByTestId("monaco");

    expect(editor.textContent).toBe(CONTENT);
    expect(editor.getAttribute("data-readonly")).toBe("true");
  });

  it("expose métadonnées et lien « Ouvrir sur GitHub » (commit + path)", async () => {
    stubFetch();
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    useWorldStore.setState({ selectedFileNodeId: IDS.fileA, codePanelOpen: true });

    render(<CodePanel />);
    await screen.findByTestId("monaco");

    const link = screen.getByRole("link", { name: /Ouvrir sur GitHub/ });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/acme/repo/blob/abc1230000000000000000000000000000000000/src/a.ts",
    );
    expect(screen.getByText("TypeScript")).toBeDefined();
    expect(screen.getByText("1,5 Ko")).toBeDefined();
  });

  it("ne rend rien quand le panneau est fermé", () => {
    loadWorldIntoStore(makeWorld(), IDS.srcRoom);
    useWorldStore.setState({ selectedFileNodeId: IDS.fileA, codePanelOpen: false });
    const { container } = render(<CodePanel />);
    expect(container.firstChild).toBeNull();
  });
});
