// Resumos, histórico e exportação. A SESSÃO de pesagem é a referência dos relatórios.
import { db } from "./banco";
import type { Animal, LoteCompra, Pesagem, Sessao } from "./tipos";
import { ErroDeRegra, exigirAnimal } from "./comum";
import { animaisFaltantes } from "./pesagem";
import { calcularGMD, historicoComGMD, media, resumoPesos, type Historico, type ResumoPesos } from "../regras/calculos";
import { formatarDataBR, formatarDataHoraBR, gerarCSV } from "../regras/csv";

export interface LinhaSessao {
  pesagem: Pesagem;
  animal?: Animal; // vazio se pendente
  loteCompra?: LoteCompra;
  /** GMD desde o peso de entrada do boi. */
  gmdDesdeEntrada: number | null;
}

/** Todas as pesagens da sessão (confirmadas e pendentes), na ordem em que foram feitas. */
export async function linhasDaSessao(sessaoId: number): Promise<LinhaSessao[]> {
  const pesagens = await db.pesagens.where("sessaoId").equals(sessaoId).toArray();
  const ids = pesagens.map((p) => p.animalId).filter((id): id is number => id != null);
  const animais = new Map((await db.animais.bulkGet(ids)).filter((a): a is Animal => !!a).map((a) => [a.id, a]));
  const lotes = new Map((await db.lotesCompra.toArray()).map((l) => [l.id, l]));
  return pesagens
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora))
    .map((pesagem) => {
      const animal = pesagem.animalId != null ? animais.get(pesagem.animalId) : undefined;
      const gmdDesdeEntrada = animal?.pesoEntrada != null && animal.dataEntrada
        ? calcularGMD(animal.pesoEntrada, animal.dataEntrada, pesagem.peso, pesagem.dataHora)
        : null;
      return { pesagem, animal, loteCompra: animal ? lotes.get(animal.loteCompraId) : undefined, gmdDesdeEntrada };
    });
}

export interface ResumoGrupo {
  pesos: ResumoPesos;
  /** Média do GMD do período (desde a pesagem anterior ou a entrada). */
  gmdMedio: number | null;
  /** Média do GMD desde a entrada. */
  gmdMedioDesdeEntrada: number | null;
}

export interface ResumoSessao {
  sessao: Sessao;
  geral: ResumoGrupo;
  porLoteCompra: { loteCompra: LoteCompra; resumo: ResumoGrupo }[];
  pendentes: number;
  faltantes: number;
  totalAtivos: number;
  comAlerta: number;
}

function resumirGrupo(linhas: LinhaSessao[]): ResumoGrupo {
  return {
    pesos: resumoPesos(linhas.map((l) => l.pesagem.peso)),
    gmdMedio: media(linhas
      .filter((l) => l.pesagem.gmdPeriodo != null && l.pesagem.refFonte !== "compra")
      .map((l) => l.pesagem.gmdPeriodo!)),
    gmdMedioDesdeEntrada: media(linhas.filter((l) => l.gmdDesdeEntrada != null).map((l) => l.gmdDesdeEntrada!)),
  };
}

export async function resumoDaSessao(sessaoId: number): Promise<ResumoSessao> {
  const sessao = await db.sessoes.get(sessaoId);
  if (!sessao) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
  const linhas = await linhasDaSessao(sessaoId);
  const confirmadas = linhas.filter((l) => l.pesagem.status === "confirmada");

  const porLote = new Map<number, { loteCompra: LoteCompra; linhas: LinhaSessao[] }>();
  for (const l of confirmadas) {
    if (!l.loteCompra) continue;
    const g = porLote.get(l.loteCompra.id) ?? { loteCompra: l.loteCompra, linhas: [] };
    g.linhas.push(l);
    porLote.set(l.loteCompra.id, g);
  }

  const totalAtivos = (await db.animais.where("cicloId").equals(sessao.cicloId).toArray())
    .filter((a) => a.status === "ativo").length;

  return {
    sessao,
    geral: resumirGrupo(confirmadas),
    porLoteCompra: [...porLote.values()]
      .sort((a, b) => a.loteCompra.nome.localeCompare(b.loteCompra.nome, "pt-BR", { numeric: true }))
      .map((g) => ({ loteCompra: g.loteCompra, resumo: resumirGrupo(g.linhas) })),
    pendentes: linhas.length - confirmadas.length,
    faltantes: (await animaisFaltantes(sessaoId)).length,
    totalAtivos,
    comAlerta: confirmadas.filter((l) => l.pesagem.alertas?.length).length,
  };
}

/** Peso de entrada + todas as pesagens confirmadas do boi, com GMD entre elas. */
export async function historicoDoAnimal(animalId: number): Promise<Historico> {
  const animal = await exigirAnimal(animalId);
  const pontos = (await db.pesagens.where("animalId").equals(animalId).toArray())
    .filter((p) => p.status === "confirmada")
    .map((p) => ({ dataHora: p.dataHora, peso: p.peso }));
  if (animal.pesoEntrada != null && animal.dataEntrada) {
    pontos.push({ dataHora: animal.dataEntrada, peso: animal.pesoEntrada });
  }
  return historicoComGMD(pontos);
}

const NOME_REFERENCIA = { pesagem: "Pesagem anterior", entrada: "Entrada", compra: "Média de entrada do lote" } as const;
const NOME_ALERTA = {
  "gmd-fora-da-faixa": "GMD fora da faixa",
  "gmd-distante-da-mediana": "GMD distante da sessão",
  "peso-distante-da-compra": "Peso distante da compra",
  "peso-fora-da-margem": "Peso fora da margem",
} as const;

/** Planilha da sessão para Excel: uma linha por pesagem. */
export async function exportarSessaoCSV(sessaoId: number): Promise<string> {
  const linhas = await linhasDaSessao(sessaoId);
  const corpo = linhas.map(({ pesagem: p, animal, loteCompra, gmdDesdeEntrada }) => [
    animal?.brinco ?? p.idProvisorio ?? "",
    loteCompra?.nome ?? "",
    animal?.raca ?? "",
    p.peso,
    formatarDataHoraBR(p.dataHora),
    p.refFonte ? NOME_REFERENCIA[p.refFonte] : "",
    p.refPeso ?? null,
    p.refData ? formatarDataBR(p.refData) : "",
    p.gmdPeriodo ?? null,
    animal?.pesoEntrada ?? null,
    gmdDesdeEntrada,
    (p.alertas ?? []).map((a) => NOME_ALERTA[a]).join(", "),
    p.status === "pendente" ? "Pendente (sem brinco)" : "Confirmada",
    p.observacao ?? "",
  ]);
  return gerarCSV(
    ["Brinco", "Lote de compra", "Raça", "Peso (kg)", "Data/hora", "Referência", "Peso ref. (kg)", "Data ref.",
     "GMD período (kg/dia)", "Peso entrada (kg)", "GMD desde entrada (kg/dia)", "Alerta confirmado", "Situação", "Observação"],
    corpo,
  );
}
