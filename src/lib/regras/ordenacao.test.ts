import { describe, expect, it } from "vitest";
import { ordenarBois, type BoiOrdenavel } from "./ordenacao";

const bois: BoiOrdenavel[] = [
  { id: 1, brinco: "10", pesoAtual: 430, pesoEntrada: 400, gmd: 1.0, ultimaPesagem: "2026-02-09", lote: "A", raca: "Nelore" },
  { id: 2, brinco: "2", pesoAtual: 420, pesoEntrada: 380, gmd: 1.33, ultimaPesagem: "2026-03-01", lote: "B", raca: "Angus" },
  { id: 3, brinco: "0123", pesoAtual: null, gmd: null, lote: "A" },
  { id: 4, brinco: "1", pesoAtual: 500, pesoEntrada: 450, gmd: 0.5, ultimaPesagem: "2026-01-20", lote: "B", raca: "Nelore", diasAteAlvo: 0 },
];
const brincos = (l: BoiOrdenavel[]) => l.map((b) => b.brinco);

describe("ordenarBois", () => {
  it("brinco em ordem natural (2 antes de 10; 0123 vale 123)", () => {
    expect(brincos(ordenarBois(bois, "brinco"))).toEqual(["1", "2", "10", "0123"]);
    expect(brincos(ordenarBois(bois, "brinco", false))).toEqual(["0123", "10", "2", "1"]);
  });
  it("ordem de cadastro", () => {
    expect(brincos(ordenarBois(bois, "cadastro"))).toEqual(["10", "2", "0123", "1"]);
  });
  it("valores ausentes ficam sempre no fim", () => {
    expect(brincos(ordenarBois(bois, "pesoAtual"))).toEqual(["2", "10", "1", "0123"]);
    expect(brincos(ordenarBois(bois, "pesoAtual", false))).toEqual(["1", "10", "2", "0123"]);
    expect(brincos(ordenarBois(bois, "gmd", false))).toEqual(["2", "10", "1", "0123"]);
  });
  it("última pesagem: mais antiga primeiro", () => {
    expect(brincos(ordenarBois(bois, "ultimaPesagem"))).toEqual(["1", "10", "2", "0123"]);
  });
  it("agrupa por lote e, dentro do lote, pelo brinco", () => {
    expect(brincos(ordenarBois(bois, "lote"))).toEqual(["10", "0123", "1", "2"]);
  });
});
