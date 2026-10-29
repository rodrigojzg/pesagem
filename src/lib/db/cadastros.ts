// Cadastros feitos ANTES da pesagem: lotes de compra e bois.
import { db } from "./banco";
import type { Animal, LoteCompra, TrocaBrinco } from "./tipos";
import {
  agora, animalAtivoPorBrinco, ErroDeRegra, exigirAnimal, exigirCicloAtivo, exigirLoteCompra, textoOuNada,
} from "./comum";
import { alertaMargemPeso, media, normalizarBrinco, validarPeso, type Alerta } from "../regras/calculos";
import { margemDoCiclo } from "./ciclos";

/* ===================== Lotes de compra ===================== */

export interface DadosLoteCompra {
  nome: string;
  dataCompra?: string;
  fornecedor?: string;
  valorPago?: number;
  observacao?: string;
}

function validarLoteCompra(d: DadosLoteCompra) {
  if (!d.nome.trim()) throw new ErroDeRegra("Informe o nome do lote de compra.");
  if (d.valorPago != null && (!Number.isFinite(d.valorPago) || d.valorPago < 0)) {
    throw new ErroDeRegra("Valor pago inválido.");
  }
}

const limparLote = (d: DadosLoteCompra) => ({
  nome: d.nome.trim(),
  dataCompra: textoOuNada(d.dataCompra),
  fornecedor: textoOuNada(d.fornecedor),
  valorPago: d.valorPago,
  observacao: textoOuNada(d.observacao),
});

async function nomeDeLoteEmUso(cicloId: number, nome: string, ignorarId?: number) {
  const lotes = await db.lotesCompra.where("cicloId").equals(cicloId).toArray();
  return lotes.some((l) => l.id !== ignorarId && l.nome.toLowerCase() === nome.trim().toLowerCase());
}

export async function criarLoteCompra(cicloId: number, dados: DadosLoteCompra): Promise<number> {
  validarLoteCompra(dados);
  return db.transaction("rw", db.ciclos, db.lotesCompra, async () => {
    await exigirCicloAtivo(cicloId);
    if (await nomeDeLoteEmUso(cicloId, dados.nome)) {
      throw new ErroDeRegra(`Já existe um lote de compra chamado "${dados.nome.trim()}".`);
    }
    return db.lotesCompra.add({ cicloId, ...limparLote(dados) });
  });
}

export async function atualizarLoteCompra(id: number, dados: DadosLoteCompra): Promise<void> {
  validarLoteCompra(dados);
  await db.transaction("rw", db.lotesCompra, async () => {
    const l = await db.lotesCompra.get(id);
    if (!l) throw new ErroDeRegra("Lote de compra não encontrado.");
    if (await nomeDeLoteEmUso(l.cicloId, dados.nome, id)) {
      throw new ErroDeRegra(`Já existe um lote de compra chamado "${dados.nome.trim()}".`);
    }
    await db.lotesCompra.put({ ...l, ...limparLote(dados) });
  });
}

export async function listarLotesCompra(cicloId: number): Promise<LoteCompra[]> {
  const lotes = await db.lotesCompra.where("cicloId").equals(cicloId).toArray();
  return lotes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

export interface ResumoLoteCompra {
  bois: number;
  /** Quantos bois têm peso de entrada (entram no cálculo do peso médio). */
  boisComPeso: number;
  /** Média dos pesos de entrada dos bois do lote (calculada, não digitada). */
  pesoMedioEntrada: number | null;
  pesoTotalEntrada: number;
  /** Data de entrada mais antiga entre os bois (usada quando o lote não tem data de compra). */
  primeiraEntrada?: string;
  valorPorCabeca: number | null;
  valorPorKg: number | null;
  /** Pesagens já registradas dos bois deste lote. */
  pesagens: number;
}

/** Números calculados do lote de compra a partir dos bois cadastrados nele. */
export async function resumoLoteCompra(loteCompraId: number): Promise<ResumoLoteCompra> {
  const lote = await db.lotesCompra.get(loteCompraId);
  if (!lote) throw new ErroDeRegra("Lote de compra não encontrado.");
  const bois = await db.animais.where("loteCompraId").equals(loteCompraId).toArray();
  const comPeso = bois.filter((b) => b.pesoEntrada != null);
  const pesos = comPeso.map((b) => b.pesoEntrada!);
  const pesoTotalEntrada = pesos.reduce((s, p) => s + p, 0);
  const datas = comPeso.map((b) => b.dataEntrada).filter((d): d is string => !!d).sort();
  const ids = new Set(bois.map((b) => b.id));
  const pesagens = ids.size
    ? (await db.pesagens.where("animalId").anyOf([...ids]).toArray()).length
    : 0;
  return {
    bois: bois.length,
    boisComPeso: comPeso.length,
    pesoMedioEntrada: media(pesos),
    pesoTotalEntrada,
    primeiraEntrada: datas[0],
    valorPorCabeca: lote.valorPago != null && bois.length ? lote.valorPago / bois.length : null,
    valorPorKg: lote.valorPago != null && pesoTotalEntrada > 0 && comPeso.length === bois.length
      ? lote.valorPago / pesoTotalEntrada
      : null,
    pesagens,
  };
}

/**
 * Apaga um lote de compra.
 * - Lote vazio: apaga direto.
 * - Lote com bois: informe `moverParaLoteId` (os bois vão para outro lote)
 *   ou `apagarBois: true` (apaga também os bois, as pesagens e o histórico de brincos).
 */
export async function excluirLoteCompra(
  loteCompraId: number,
  opcao: { moverParaLoteId?: number; apagarBois?: boolean } = {},
): Promise<void> {
  await db.transaction("rw", [db.lotesCompra, db.animais, db.pesagens, db.trocasBrinco], async () => {
    const lote = await db.lotesCompra.get(loteCompraId);
    if (!lote) throw new ErroDeRegra("Lote de compra não encontrado.");
    const bois = await db.animais.where("loteCompraId").equals(loteCompraId).toArray();
    if (bois.length) {
      if (opcao.moverParaLoteId != null) {
        if (opcao.moverParaLoteId === loteCompraId) throw new ErroDeRegra("Escolha um lote diferente.");
        await exigirLoteCompra(opcao.moverParaLoteId, lote.cicloId);
        for (const b of bois) await db.animais.update(b.id, { loteCompraId: opcao.moverParaLoteId });
      } else if (opcao.apagarBois) {
        const ids = bois.map((b) => b.id);
        await db.pesagens.where("animalId").anyOf(ids).delete();
        await db.trocasBrinco.where("animalId").anyOf(ids).delete();
        await db.animais.bulkDelete(ids);
      } else {
        throw new ErroDeRegra(`O lote tem ${bois.length} bois. Escolha mover os bois ou apagar tudo.`);
      }
    }
    await db.lotesCompra.delete(loteCompraId);
  });
}

/* ===================== Bois ===================== */

/** Peso de entrada fora da margem do rebanho: confirme com `confirmarMargem: true`. */
export class ErroForaDaMargem extends ErroDeRegra {
  constructor(public readonly alertas: Alerta[]) {
    super(alertas.map((a) => a.mensagem).join(" "));
    this.name = "ErroForaDaMargem";
  }
}

export interface DadosAnimal {
  brinco: string;
  loteCompraId: number;
  raca?: string;
  pesoEntrada?: number;
  dataEntrada?: string;
  observacao?: string;
  /** Aceita peso de entrada fora da margem do rebanho. */
  confirmarMargem?: boolean;
}

function validarAnimal(d: DadosAnimal): string {
  const brinco = normalizarBrinco(d.brinco);
  if (!brinco) throw new ErroDeRegra("Informe o número do brinco.");
  if (d.pesoEntrada != null) validarPeso(d.pesoEntrada);
  if (d.pesoEntrada != null && !textoOuNada(d.dataEntrada)) {
    throw new ErroDeRegra("Informe a data de entrada junto com o peso de entrada.");
  }
  return brinco;
}

export async function cadastrarAnimal(cicloId: number, dados: DadosAnimal): Promise<number> {
  const brinco = validarAnimal(dados);
  return db.transaction("rw", [db.ciclos, db.lotesCompra, db.animais], async () => {
    const ciclo = await exigirCicloAtivo(cicloId);
    await exigirLoteCompra(dados.loteCompraId, cicloId);
    if (dados.pesoEntrada != null && !dados.confirmarMargem) {
      const alertas = alertaMargemPeso(dados.pesoEntrada, margemDoCiclo(ciclo));
      if (alertas.length) throw new ErroForaDaMargem(alertas);
    }
    if (await animalAtivoPorBrinco(cicloId, brinco)) {
      throw new ErroDeRegra(`Já existe um boi ativo com o brinco ${brinco}.`);
    }
    return db.animais.add({
      cicloId,
      loteCompraId: dados.loteCompraId,
      brinco,
      raca: textoOuNada(dados.raca),
      pesoEntrada: dados.pesoEntrada,
      dataEntrada: textoOuNada(dados.dataEntrada),
      observacao: textoOuNada(dados.observacao),
      status: "ativo",
      criadoEm: agora(),
    });
  });
}

/** Altera os dados do boi. Para mudar o brinco use `trocarBrinco` (guarda o histórico). */
export async function atualizarAnimal(id: number, dados: Omit<DadosAnimal, "brinco">): Promise<void> {
  validarAnimal({ ...dados, brinco: "x" });
  await db.transaction("rw", [db.ciclos, db.lotesCompra, db.animais], async () => {
    const a = await exigirAnimal(id);
    await exigirLoteCompra(dados.loteCompraId, a.cicloId);
    const ciclo = await db.ciclos.get(a.cicloId);
    if (ciclo && dados.pesoEntrada != null && dados.pesoEntrada !== a.pesoEntrada && !dados.confirmarMargem) {
      const alertas = alertaMargemPeso(dados.pesoEntrada, margemDoCiclo(ciclo));
      if (alertas.length) throw new ErroForaDaMargem(alertas);
    }
    await db.animais.put({
      ...a,
      loteCompraId: dados.loteCompraId,
      raca: textoOuNada(dados.raca),
      pesoEntrada: dados.pesoEntrada,
      dataEntrada: textoOuNada(dados.dataEntrada),
      observacao: textoOuNada(dados.observacao),
    });
  });
}

export async function listarAnimais(
  cicloId: number,
  filtro: { loteCompraId?: number; incluirInativos?: boolean; busca?: string } = {},
): Promise<Animal[]> {
  let animais = await db.animais.where("cicloId").equals(cicloId).toArray();
  if (!filtro.incluirInativos) animais = animais.filter((a) => a.status === "ativo");
  if (filtro.loteCompraId != null) animais = animais.filter((a) => a.loteCompraId === filtro.loteCompraId);
  const busca = normalizarBrinco(filtro.busca ?? "");
  if (busca) animais = animais.filter((a) => a.brinco.includes(busca));
  return animais.sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }));
}

/** Marca como inativo (vendido, morto...). O histórico fica e o brinco pode ser reutilizado. */
export async function inativarAnimal(animalId: number): Promise<void> {
  await exigirAnimal(animalId);
  await db.animais.update(animalId, { status: "inativo" });
}

/** Coloca brinco novo no boi (ex.: perdeu o antigo) e guarda o histórico. */
export async function trocarBrinco(animalId: number, novoBrinco: string, motivo = "Perda do brinco"): Promise<void> {
  const novo = normalizarBrinco(novoBrinco);
  if (!novo) throw new ErroDeRegra("Informe o número do brinco novo.");
  await db.transaction("rw", db.animais, db.trocasBrinco, async () => {
    const a = await exigirAnimal(animalId);
    if (a.brinco === novo) return;
    if (await animalAtivoPorBrinco(a.cicloId, novo)) {
      throw new ErroDeRegra(`Já existe um boi ativo com o brinco ${novo}.`);
    }
    await db.trocasBrinco.add({ animalId, brincoAnterior: a.brinco, brincoNovo: novo, data: agora(), motivo });
    await db.animais.update(animalId, { brinco: novo });
  });
}

export async function historicoDeBrincos(animalId: number): Promise<TrocaBrinco[]> {
  const trocas = await db.trocasBrinco.where("animalId").equals(animalId).toArray();
  return trocas.sort((a, b) => a.data.localeCompare(b.data));
}

/* ===================== Consultas simples ===================== */

export async function obterLoteCompra(id: number): Promise<LoteCompra | undefined> {
  return db.lotesCompra.get(id);
}

export async function obterAnimal(id: number): Promise<Animal | undefined> {
  return db.animais.get(id);
}
