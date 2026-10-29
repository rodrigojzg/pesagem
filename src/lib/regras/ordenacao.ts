// Ordenação e filtros da lista de bois (aba Rebanho).

export type CriterioOrdem =
  | "brinco" | "cadastro" | "pesoAtual" | "pesoEntrada" | "gmd" | "ultimaPesagem" | "abate" | "lote" | "raca";

export const CRITERIOS: { valor: CriterioOrdem; nome: string }[] = [
  { valor: "brinco", nome: "Brinco" },
  { valor: "cadastro", nome: "Ordem de cadastro / planilha" },
  { valor: "pesoAtual", nome: "Peso atual" },
  { valor: "pesoEntrada", nome: "Peso de entrada" },
  { valor: "gmd", nome: "GMD" },
  { valor: "ultimaPesagem", nome: "Última pesagem" },
  { valor: "abate", nome: "Previsão de abate" },
  { valor: "lote", nome: "Lote de compra" },
  { valor: "raca", nome: "Raça" },
];

/** Dados mínimos de um boi para ordenar (vem de DesempenhoBoi). */
export interface BoiOrdenavel {
  id: number;
  brinco: string;
  pesoAtual: number | null;
  pesoEntrada?: number;
  gmd: number | null;
  ultimaPesagem?: string;
  diasAteAlvo?: number | null;
  lote?: string;
  raca?: string;
}

const porBrinco = (a: BoiOrdenavel, b: BoiOrdenavel) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true });
const porTexto = (a?: string, b?: string) => (a ?? "").localeCompare(b ?? "", "pt-BR", { numeric: true });

/**
 * Ordena os bois. Valores ausentes (ex.: boi nunca pesado) ficam sempre no fim,
 * qualquer que seja o sentido. Empates são desfeitos pelo brinco.
 */
export function ordenarBois<T extends BoiOrdenavel>(bois: T[], criterio: CriterioOrdem, crescente = true): T[] {
  const sentido = crescente ? 1 : -1;
  const numero = (f: (b: T) => number | null | undefined) => (a: T, b: T) => {
    const va = f(a);
    const vb = f(b);
    if (va == null && vb == null) return porBrinco(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sentido || porBrinco(a, b);
  };
  const texto = (f: (b: T) => string | undefined) => (a: T, b: T) => {
    const va = f(a);
    const vb = f(b);
    if (!va && !vb) return porBrinco(a, b);
    if (!va) return 1;
    if (!vb) return -1;
    return porTexto(va, vb) * sentido || porBrinco(a, b);
  };
  const comparadores: Record<CriterioOrdem, (a: T, b: T) => number> = {
    brinco: (a, b) => porBrinco(a, b) * sentido,
    cadastro: (a, b) => (a.id - b.id) * sentido,
    pesoAtual: numero((b) => b.pesoAtual),
    pesoEntrada: numero((b) => b.pesoEntrada),
    gmd: numero((b) => b.gmd),
    ultimaPesagem: texto((b) => b.ultimaPesagem),
    abate: numero((b) => b.diasAteAlvo),
    lote: texto((b) => b.lote),
    raca: texto((b) => b.raca),
  };
  return [...bois].sort(comparadores[criterio]);
}
