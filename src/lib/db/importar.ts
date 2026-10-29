// Importação de planilha (CSV ou XLSX já convertida em linhas de texto).
// Uma linha por boi; colunas fixas + uma coluna de peso para cada data ("Peso 15/02/2026").
import { db } from "./banco";
import type { Animal } from "./tipos";
import { agora, animalAtivoPorBrinco, exigirCicloAtivo, textoOuNada } from "./comum";
import { configGMD, margemDoCiclo } from "./ciclos";
import { referenciaDoAnimal } from "./pesagem";
import { alertaMargemPeso, alertasDeGMD, diasEntre, normalizarBrinco, PESO_MAXIMO_KG } from "../regras/calculos";
import { colunasDePesagem, lerCSV, lerDataBR, lerNumeroBR, mapearCabecalho } from "../regras/importacao";
import { formatarDataBR } from "../regras/csv";

export interface ResultadoImportacao {
  bois: number;
  boisExistentes: number;
  pesagens: number;
  sessoesCriadas: string[]; // datas AAAA-MM-DD
  lotesCriados: string[];
  /** Se houver erros, NADA é importado; corrija a planilha e tente de novo. */
  erros: { linha: number; mensagem: string }[];
  /** Observações que não impedem a importação (ex.: GMD estranho, pesagem já existente). */
  avisos: string[];
}

interface LinhaBoi {
  linha: number;
  brinco: string;
  lote: string;
  raca: string;
  pesoEntrada?: number;
  dataEntrada?: string;
  observacao: string;
  pesos: { data: string; peso: number }[];
}

/** Meio-dia local da data, em ISO (evita trocar de dia por causa do fuso). */
function dataHoraDaData(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(a, m - 1, d, 12).toISOString();
}

/**
 * Cadastra bois e/ou registra pesagens a partir das linhas de uma planilha.
 * - Boi novo: precisa de "Lote de compra" (lotes que não existem são criados).
 * - Boi já cadastrado (mesmo brinco): só as pesagens são acrescentadas.
 * - Cada data de pesagem vira uma sessão encerrada, marcada como "importada".
 */
export async function importarPlanilhaAnimais(cicloId: number, linhas: string[][]): Promise<ResultadoImportacao> {
  const vazio = (mensagem: string): ResultadoImportacao => ({
    bois: 0, boisExistentes: 0, pesagens: 0, sessoesCriadas: [], lotesCriados: [], erros: [{ linha: 1, mensagem }], avisos: [],
  });
  if (linhas.length < 2) return vazio("Planilha vazia.");
  const cabecalho = linhas[0].map((c) => String(c ?? "").trim());
  const col = mapearCabecalho(cabecalho);
  const colPesos = colunasDePesagem(cabecalho);
  if (col.brinco == null) return vazio('O cabeçalho precisa ter a coluna "Brinco".');

  const celula = (l: string[], c?: number) => (c == null ? "" : String(l[c] ?? "").trim());
  const erros: ResultadoImportacao["erros"] = [];
  const avisos: string[] = [];
  const vistos = new Set<string>();
  const registros: LinhaBoi[] = [];

  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    const n = i + 1;
    if (l.every((c) => !String(c ?? "").trim())) continue;
    const brinco = normalizarBrinco(celula(l, col.brinco));
    if (!brinco) { erros.push({ linha: n, mensagem: "Brinco vazio." }); continue; }
    if (vistos.has(brinco)) { erros.push({ linha: n, mensagem: `Brinco ${brinco} repetido na planilha.` }); continue; }
    vistos.add(brinco);

    const pesoEntrada = lerNumeroBR(celula(l, col.pesoEntrada));
    const dataEntrada = lerDataBR(celula(l, col.dataEntrada));
    let ok = true;
    if (pesoEntrada !== undefined && !(pesoEntrada > 0 && pesoEntrada <= PESO_MAXIMO_KG)) {
      erros.push({ linha: n, mensagem: `Brinco ${brinco}: peso de entrada inválido.` }); ok = false;
    }
    if (dataEntrada === null) { erros.push({ linha: n, mensagem: `Brinco ${brinco}: data de entrada inválida (use dd/mm/aaaa).` }); ok = false; }
    if (pesoEntrada !== undefined && !dataEntrada) {
      erros.push({ linha: n, mensagem: `Brinco ${brinco}: informe a data de entrada junto com o peso.` }); ok = false;
    }
    const pesos: LinhaBoi["pesos"] = [];
    for (const { coluna, data } of colPesos) {
      const v = lerNumeroBR(celula(l, coluna));
      if (v === undefined) continue;
      if (!(v > 0 && v <= PESO_MAXIMO_KG)) {
        erros.push({ linha: n, mensagem: `Brinco ${brinco}: peso inválido em ${formatarDataBR(data)}.` }); ok = false;
      } else pesos.push({ data, peso: v });
    }
    if (ok) {
      registros.push({
        linha: n, brinco, lote: celula(l, col.loteCompra), raca: celula(l, col.raca),
        pesoEntrada, dataEntrada: dataEntrada ?? undefined, observacao: celula(l, col.observacao), pesos,
      });
    }
  }

  return db.transaction("rw", [db.ciclos, db.lotesCompra, db.animais, db.sessoes, db.pesagens], async () => {
    const ciclo = await exigirCicloAtivo(cicloId);

    // 1) Confere bois novos x existentes antes de gravar qualquer coisa.
    const existentes = new Map<string, Animal>();
    for (const r of registros) {
      const a = await animalAtivoPorBrinco(cicloId, r.brinco);
      if (a) existentes.set(r.brinco, a);
      else if (!r.lote) erros.push({ linha: r.linha, mensagem: `Brinco ${r.brinco} não está cadastrado: informe o lote de compra.` });
    }
    if (erros.length) {
      return { bois: 0, boisExistentes: 0, pesagens: 0, sessoesCriadas: [], lotesCriados: [], erros, avisos: [] };
    }

    // Pesos fora da margem do rebanho: não bloqueiam, viram observação.
    const margem = margemDoCiclo(ciclo);
    for (const r of registros) {
      if (r.pesoEntrada != null && !existentes.has(r.brinco)) {
        const a = alertaMargemPeso(r.pesoEntrada, margem);
        if (a.length) avisos.push(`Brinco ${r.brinco}, peso de entrada: ${a[0].mensagem}`);
      }
    }

    // 2) Lotes de compra e bois novos.
    const lotes = new Map((await db.lotesCompra.where("cicloId").equals(cicloId).toArray()).map((l) => [l.nome.toLowerCase(), l.id]));
    const lotesCriados: string[] = [];
    const animalPorBrinco = new Map(existentes);
    let bois = 0;
    for (const r of registros) {
      if (existentes.has(r.brinco)) continue;
      let loteId = lotes.get(r.lote.toLowerCase());
      if (loteId == null) {
        loteId = await db.lotesCompra.add({ cicloId, nome: r.lote });
        lotes.set(r.lote.toLowerCase(), loteId);
        lotesCriados.push(r.lote);
      }
      const id = await db.animais.add({
        cicloId, loteCompraId: loteId, brinco: r.brinco, raca: textoOuNada(r.raca),
        pesoEntrada: r.pesoEntrada, dataEntrada: r.dataEntrada, observacao: textoOuNada(r.observacao),
        status: "ativo", criadoEm: agora(),
      });
      animalPorBrinco.set(r.brinco, (await db.animais.get(id))!);
      bois++;
    }

    // 3) Pesagens: uma sessão por data, em ordem cronológica (para o GMD usar a pesagem anterior certa).
    const sessoesDoCiclo = await db.sessoes.where("cicloId").equals(cicloId).toArray();
    const sessaoPorData = new Map(sessoesDoCiclo.map((s) => [s.data, s.id]));
    const sessoesCriadas: string[] = [];
    const config = configGMD(ciclo);
    let pesagens = 0;
    const datas = [...new Set(registros.flatMap((r) => r.pesos.map((p) => p.data)))].sort();
    for (const data of datas) {
      let sessaoId = sessaoPorData.get(data);
      if (sessaoId == null) {
        const quando = agora();
        sessaoId = await db.sessoes.add({
          cicloId, data, descricao: "Importada da planilha", importada: true, abertaEm: quando, encerradaEm: quando,
        });
        sessaoPorData.set(data, sessaoId);
        sessoesCriadas.push(data);
      }
      const dataHora = dataHoraDaData(data);
      for (const r of registros) {
        const p = r.pesos.find((x) => x.data === data);
        if (!p) continue;
        const animal = animalPorBrinco.get(r.brinco)!;
        const ja = await db.pesagens.where("[sessaoId+animalId]").equals([sessaoId, animal.id]).first();
        if (ja) {
          avisos.push(`Brinco ${r.brinco}: já tinha pesagem em ${formatarDataBR(data)} (${ja.peso} kg); mantida a existente.`);
          continue;
        }
        const ref = await referenciaDoAnimal(animal, dataHora, sessaoId);
        const dias = ref ? diasEntre(ref.data, dataHora) : 0;
        const gmd = ref && dias >= 1 ? (p.peso - ref.peso) / dias : undefined;
        const alertas = [
          ...alertaMargemPeso(p.peso, margem),
          ...(gmd != null && ref?.fonte !== "compra" ? alertasDeGMD(gmd, config, dias, null) : []),
        ];
        for (const a of alertas) avisos.push(`Brinco ${r.brinco} em ${formatarDataBR(data)}: ${a.mensagem}`);
        await db.pesagens.add({
          sessaoId, animalId: animal.id, status: "confirmada", brincoLido: animal.brinco, peso: p.peso, dataHora,
          origem: "manual", refFonte: ref?.fonte, refPeso: ref?.peso, refData: ref?.data, gmdPeriodo: gmd,
          alertas: alertas.length ? alertas.map((a) => a.tipo) : undefined,
          observacao: "Importada da planilha",
        });
        pesagens++;
      }
    }

    return {
      bois, boisExistentes: existentes.size, pesagens, sessoesCriadas, lotesCriados, erros: [], avisos,
    };
  });
}

/** Atalho para planilha CSV (texto). */
export async function importarAnimaisCSV(cicloId: number, texto: string): Promise<ResultadoImportacao> {
  return importarPlanilhaAnimais(cicloId, lerCSV(texto));
}

