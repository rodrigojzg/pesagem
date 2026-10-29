// Indicadores para a aba Resultados (dashboard). Tudo calculado a partir das pesagens confirmadas.
import { db } from "./banco";
import type { Animal, Ciclo, LoteCompra } from "./tipos";
import { exigirCiclo, hojeLocal } from "./comum";
import {
  arrobas, calcularGMD, diasAteAlvo, diasEntre, histograma, media,
} from "../regras/calculos";

/** Rendimento de carcaça usado quando o ciclo não informa um (%). */
export const RENDIMENTO_PADRAO = 52;
/** Boi sem pesagem há mais que isso aparece em "Qualidade dos dados". */
export const DIAS_SEM_PESAGEM = 45;

export interface FiltroIndicadores {
  loteCompraId?: number;
  /** "" = raça não informada. */
  raca?: string;
}

export interface DesempenhoBoi {
  animal: Animal;
  loteCompra?: LoteCompra;
  pesoAtual: number | null;
  dataPesoAtual?: string;
  /** Data da última pesagem (sem contar a entrada). */
  ultimaPesagem?: string;
  /** Tem alguma pesagem com alerta confirmado. */
  comAlerta: boolean;
  /** Ganho e GMD do primeiro ponto (entrada ou 1ª pesagem) até a última pesagem. */
  ganho: number | null;
  gmd: number | null;
  /** Dias até o peso-alvo (0 = já chegou; null = não chega com o GMD atual; undefined = sem alvo). */
  diasAteAlvo?: number | null;
  dataPrevista?: string;
}

export interface PontoEvolucao {
  sessaoId: number;
  data: string;
  quantidade: number;
  pesoMedio: number | null;
  gmdMedio: number | null;
}

export interface Indicadores {
  ciclo: Ciclo;
  visao: {
    bois: number;
    boisPesados: number;
    diasCiclo: number;
    pesoMedioAtual: number | null;
    gmdMedio: number | null;
    gmdUltimoPeriodo: number | null;
    kgProduzidos: number;
    rendimentoPct: number;
    arrobasProduzidas: number;
    valorProduzido: number | null;
    valorRebanho: number | null;
  };
  evolucao: PontoEvolucao[];
  evolucaoPorLote: { loteCompra: LoteCompra; pontos: PontoEvolucao[] }[];
  lotes: { loteCompra: LoteCompra; bois: number; pesoMedioEntrada: number | null; pesoMedioAtual: number | null; gmdMedio: number | null; custoKgCompra: number | null }[];
  racas: { raca: string; bois: number; pesoMedioAtual: number | null; gmdMedio: number | null }[];
  distribuicaoGMD: { inicio: number; fim: number; quantidade: number }[];
  distribuicaoPeso: { inicio: number; fim: number; quantidade: number }[];
  melhores: DesempenhoBoi[];
  piores: DesempenhoBoi[];
  abate: null | {
    alvo: number;
    jaNoAlvo: number;
    semPrevisao: number;
    porMes: { mes: string; quantidade: number }[]; // mes = "AAAA-MM"
  };
  qualidade: { comAlerta: number; pendentes: number; semPesagemRecente: number; nuncaPesados: number };
  todos: DesempenhoBoi[];
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export async function indicadoresDoCiclo(cicloId: number, filtro: FiltroIndicadores = {}): Promise<Indicadores> {
  const ciclo = await exigirCiclo(cicloId);
  const hoje = hojeLocal();
  const lotes = await db.lotesCompra.where("cicloId").equals(cicloId).toArray();
  const lotePorId = new Map(lotes.map((l) => [l.id, l]));

  let animais = (await db.animais.where("cicloId").equals(cicloId).toArray()).filter((a) => a.status === "ativo");
  if (filtro.loteCompraId != null) animais = animais.filter((a) => a.loteCompraId === filtro.loteCompraId);
  if (filtro.raca != null) animais = animais.filter((a) => (a.raca ?? "") === filtro.raca);
  const ids = new Set(animais.map((a) => a.id));

  const sessoes = (await db.sessoes.where("cicloId").equals(cicloId).toArray()).sort((a, b) => a.data.localeCompare(b.data));
  const sessaoIds = new Set(sessoes.map((s) => s.id));
  const todasPesagens = ids.size ? await db.pesagens.where("animalId").anyOf([...ids]).toArray() : [];
  const pesagens = todasPesagens.filter((p) => p.status === "confirmada" && sessaoIds.has(p.sessaoId));

  // ---------- Desempenho de cada boi ----------
  const porAnimal = new Map<number, { dataHora: string; peso: number }[]>();
  const comAlerta = new Set(pesagens.filter((p) => p.alertas?.length).map((p) => p.animalId!));
  for (const p of pesagens) {
    const lista = porAnimal.get(p.animalId!) ?? [];
    lista.push({ dataHora: p.dataHora, peso: p.peso });
    porAnimal.set(p.animalId!, lista);
  }
  const alvo = ciclo.pesoAlvoAbate;
  const desempenho: DesempenhoBoi[] = animais.map((animal) => {
    const pesados = (porAnimal.get(animal.id) ?? []).sort((a, b) => a.dataHora.localeCompare(b.dataHora));
    const pontos = [...pesados];
    if (animal.pesoEntrada != null && animal.dataEntrada) pontos.unshift({ dataHora: animal.dataEntrada, peso: animal.pesoEntrada });
    const ultimo = pontos[pontos.length - 1];
    const primeiro = pontos[0];
    const gmd = pontos.length >= 2 ? calcularGMD(primeiro.peso, primeiro.dataHora, ultimo.peso, ultimo.dataHora) : null;
    const d: DesempenhoBoi = {
      animal,
      loteCompra: lotePorId.get(animal.loteCompraId),
      pesoAtual: ultimo?.peso ?? null,
      dataPesoAtual: ultimo?.dataHora,
      ultimaPesagem: pesados[pesados.length - 1]?.dataHora,
      comAlerta: comAlerta.has(animal.id),
      ganho: pontos.length >= 2 ? ultimo.peso - primeiro.peso : null,
      gmd,
    };
    if (alvo != null && d.pesoAtual != null) {
      // projeta a partir da data do último peso
      d.diasAteAlvo = diasAteAlvo(d.pesoAtual, alvo, gmd ?? 0);
      if (d.diasAteAlvo != null && d.dataPesoAtual) d.dataPrevista = somarDias(d.dataPesoAtual, d.diasAteAlvo);
    }
    return d;
  });

  const comGMD = desempenho.filter((d) => d.gmd != null);
  const pesosAtuais = desempenho.filter((d) => d.pesoAtual != null).map((d) => d.pesoAtual!);
  const kgProduzidos = desempenho.reduce((s, d) => s + (d.ganho ?? 0), 0);
  const rendimentoPct = ciclo.rendimentoCarcacaPct ?? RENDIMENTO_PADRAO;
  const arrobasProduzidas = arrobas(kgProduzidos, rendimentoPct);

  // ---------- Evolução por sessão ----------
  const ponto = (sessaoId: number, data: string, lista: typeof pesagens): PontoEvolucao => ({
    sessaoId,
    data,
    quantidade: lista.length,
    pesoMedio: media(lista.map((p) => p.peso)),
    gmdMedio: media(lista.filter((p) => p.gmdPeriodo != null && p.refFonte !== "compra").map((p) => p.gmdPeriodo!)),
  });
  const evolucao = sessoes
    .map((s) => ponto(s.id, s.data, pesagens.filter((p) => p.sessaoId === s.id)))
    .filter((p) => p.quantidade > 0);
  const animalPorId = new Map(animais.map((a) => [a.id, a]));
  const evolucaoPorLote = lotes
    .map((loteCompra) => ({
      loteCompra,
      pontos: sessoes
        .map((s) => ponto(s.id, s.data, pesagens.filter((p) => p.sessaoId === s.id && animalPorId.get(p.animalId!)?.loteCompraId === loteCompra.id)))
        .filter((p) => p.quantidade > 0),
    }))
    .filter((g) => g.pontos.length > 0);

  // ---------- Comparações ----------
  const grupoLote = lotes
    .map((loteCompra) => {
      const ds = desempenho.filter((d) => d.animal.loteCompraId === loteCompra.id);
      const entradas = ds.filter((d) => d.animal.pesoEntrada != null).map((d) => d.animal.pesoEntrada!);
      const somaEntradas = entradas.reduce((s, p) => s + p, 0);
      return {
        loteCompra,
        bois: ds.length,
        pesoMedioEntrada: media(entradas),
        pesoMedioAtual: media(ds.filter((d) => d.pesoAtual != null).map((d) => d.pesoAtual!)),
        gmdMedio: media(ds.filter((d) => d.gmd != null).map((d) => d.gmd!)),
        custoKgCompra: loteCompra.valorPago != null && entradas.length === ds.length && somaEntradas > 0
          ? loteCompra.valorPago / somaEntradas : null,
      };
    })
    .filter((g) => g.bois > 0)
    .sort((a, b) => (b.gmdMedio ?? -Infinity) - (a.gmdMedio ?? -Infinity));

  const racasMap = new Map<string, DesempenhoBoi[]>();
  for (const d of desempenho) {
    const r = d.animal.raca ?? "";
    racasMap.set(r, [...(racasMap.get(r) ?? []), d]);
  }
  const racas = [...racasMap.entries()]
    .map(([raca, ds]) => ({
      raca,
      bois: ds.length,
      pesoMedioAtual: media(ds.filter((d) => d.pesoAtual != null).map((d) => d.pesoAtual!)),
      gmdMedio: media(ds.filter((d) => d.gmd != null).map((d) => d.gmd!)),
    }))
    .sort((a, b) => b.bois - a.bois);

  // ---------- Abate ----------
  let abate: Indicadores["abate"] = null;
  if (alvo != null) {
    const meses = new Map<string, number>();
    for (const d of desempenho) {
      if (d.diasAteAlvo && d.dataPrevista) meses.set(d.dataPrevista.slice(0, 7), (meses.get(d.dataPrevista.slice(0, 7)) ?? 0) + 1);
    }
    abate = {
      alvo,
      jaNoAlvo: desempenho.filter((d) => d.diasAteAlvo === 0).length,
      semPrevisao: desempenho.filter((d) => d.pesoAtual != null && d.diasAteAlvo === null).length,
      porMes: [...meses.entries()].sort().map(([mes, quantidade]) => ({ mes, quantidade })),
    };
  }

  // ---------- Qualidade dos dados ----------
  const pesagensDoCiclo = (await db.pesagens.toArray()).filter((p) => sessaoIds.has(p.sessaoId));
  const ultimaPesagem = new Map<number, string>();
  for (const p of pesagens) {
    const u = ultimaPesagem.get(p.animalId!);
    if (!u || p.dataHora > u) ultimaPesagem.set(p.animalId!, p.dataHora);
  }

  const ordenadosGMD = [...comGMD].sort((a, b) => b.gmd! - a.gmd!);
  const ultimaSessao = evolucao[evolucao.length - 1];

  return {
    ciclo,
    visao: {
      bois: animais.length,
      boisPesados: ultimaPesagem.size,
      diasCiclo: Math.max(0, diasEntre(ciclo.dataInicio, hoje)),
      pesoMedioAtual: media(pesosAtuais),
      gmdMedio: media(comGMD.map((d) => d.gmd!)),
      gmdUltimoPeriodo: ultimaSessao?.gmdMedio ?? null,
      kgProduzidos,
      rendimentoPct,
      arrobasProduzidas,
      valorProduzido: ciclo.precoArroba != null ? arrobasProduzidas * ciclo.precoArroba : null,
      valorRebanho: ciclo.precoArroba != null
        ? arrobas(pesosAtuais.reduce((s, p) => s + p, 0), rendimentoPct) * ciclo.precoArroba
        : null,
    },
    evolucao,
    evolucaoPorLote,
    lotes: grupoLote,
    racas,
    distribuicaoGMD: histograma(comGMD.map((d) => d.gmd!), 0.2),
    distribuicaoPeso: histograma(pesosAtuais, 25),
    melhores: ordenadosGMD.slice(0, 10),
    piores: ordenadosGMD.slice(-10).reverse(),
    abate,
    qualidade: {
      comAlerta: pesagens.filter((p) => p.alertas?.length).length,
      pendentes: pesagensDoCiclo.filter((p) => p.status === "pendente").length,
      semPesagemRecente: animais.filter((a) => {
        const u = ultimaPesagem.get(a.id);
        return u != null && diasEntre(u, hoje) > DIAS_SEM_PESAGEM;
      }).length,
      nuncaPesados: animais.filter((a) => !ultimaPesagem.has(a.id)).length,
    },
    todos: desempenho,
  };
}

/** Raças presentes no ciclo (para o filtro). "" = não informada. */
export async function racasDoCiclo(cicloId: number): Promise<string[]> {
  const animais = await db.animais.where("cicloId").equals(cicloId).toArray();
  return [...new Set(animais.filter((a) => a.status === "ativo").map((a) => a.raca ?? ""))].sort();
}
