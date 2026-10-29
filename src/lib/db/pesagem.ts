// Sessões de pesagem e o fluxo de pesar um boi.
//
// Fluxo na tela de pesagem:
//   1. identificarBrinco()  → mostra a ficha do boi (ou sugere brincos parecidos)
//   2. avaliarPeso()        → GMD do período e alertas (opcional, para pré-visualizar)
//   3. registrarPesagem()   → salva; se houver alerta, exige confirmação
//   Boi sem brinco: registrarSemBrinco() → pendente → sugerirParaPendente() → resolverPendente()
import { db } from "./banco";
import type { Animal, Ciclo, FonteReferencia, LoteCompra, OrigemPeso, Pesagem, Sessao } from "./tipos";
import {
  agora, animalAtivoPorBrinco, ErroDeRegra, exigirAnimal, exigirCicloAtivo, exigirSessaoAberta, hojeLocal, textoOuNada,
} from "./comum";
import { trocarBrinco } from "./cadastros";
import { configGMD, margemDoCiclo } from "./ciclos";
import {
  alertaMargemPeso, alertaPesoCompra, alertasDeGMD, brincosParecidos, diasEntre, gmdCentral, media, mediana, MINIMO_PARA_MEDIANA,
  normalizarBrinco, validarPeso, type Alerta,
} from "../regras/calculos";

/* ===================== Erros específicos ===================== */

export class ErroPesagemDuplicada extends ErroDeRegra {
  constructor(public readonly pesagemExistente: Pesagem, brinco: string) {
    super(`O boi ${brinco} já foi pesado nesta sessão (${pesagemExistente.peso} kg).`);
    this.name = "ErroPesagemDuplicada";
  }
}

export class ErroAlertaPeso extends ErroDeRegra {
  constructor(public readonly avaliacao: AvaliacaoPeso) {
    super(avaliacao.alertas.map((a) => a.mensagem).join(" "));
    this.name = "ErroAlertaPeso";
  }
}

/* ===================== Sessões ===================== */

export async function sessaoAberta(cicloId: number): Promise<Sessao | undefined> {
  return db.sessoes.where("cicloId").equals(cicloId).filter((s) => !s.encerradaEm).first();
}

export async function abrirSessao(cicloId: number, dados: { data?: string; descricao?: string } = {}): Promise<number> {
  return db.transaction("rw", db.ciclos, db.sessoes, async () => {
    await exigirCicloAtivo(cicloId);
    if (await sessaoAberta(cicloId)) throw new ErroDeRegra("Já existe uma sessão de pesagem aberta.");
    return db.sessoes.add({
      cicloId, data: dados.data || hojeLocal(), descricao: textoOuNada(dados.descricao), abertaEm: agora(),
    });
  });
}

export async function encerrarSessao(sessaoId: number): Promise<void> {
  await exigirSessaoAberta(sessaoId);
  await db.sessoes.update(sessaoId, { encerradaEm: agora() });
}

/** Sessões do ciclo, da mais recente para a mais antiga. */
export async function listarSessoes(cicloId: number): Promise<Sessao[]> {
  const s = await db.sessoes.where("cicloId").equals(cicloId).toArray();
  return s.sort((a, b) => b.abertaEm.localeCompare(a.abertaEm));
}

/* ===================== Referência e avaliação ===================== */

export interface Referencia {
  fonte: FonteReferencia;
  peso: number;
  data: string;
}

/**
 * Peso de referência do boi para calcular o GMD do período, por ordem de preferência:
 * última pesagem confirmada em OUTRA sessão → peso de entrada → peso médio de compra.
 */
export async function referenciaDoAnimal(animal: Animal, antesDe: string, sessaoAtualId: number): Promise<Referencia | null> {
  const anteriores = await db.pesagens
    .where("animalId").equals(animal.id)
    .filter((p) => p.status === "confirmada" && p.sessaoId !== sessaoAtualId && p.dataHora < antesDe)
    .toArray();
  if (anteriores.length) {
    const ultima = anteriores.reduce((a, b) => (a.dataHora > b.dataHora ? a : b));
    return { fonte: "pesagem", peso: ultima.peso, data: ultima.dataHora };
  }
  if (animal.pesoEntrada != null && animal.dataEntrada) {
    return { fonte: "entrada", peso: animal.pesoEntrada, data: animal.dataEntrada };
  }
  // Último recurso: média dos pesos de entrada dos outros bois do mesmo lote de compra.
  const lote = await db.lotesCompra.get(animal.loteCompraId);
  const doLote = (await db.animais.where("loteCompraId").equals(animal.loteCompraId).toArray())
    .filter((a) => a.pesoEntrada != null && a.dataEntrada);
  const pesoMedio = media(doLote.map((a) => a.pesoEntrada!));
  const data = lote?.dataCompra ?? doLote.map((a) => a.dataEntrada!).sort()[0];
  if (pesoMedio != null && data) {
    return { fonte: "compra", peso: pesoMedio, data };
  }
  return null;
}

/** Mediana do GMD dos bois já pesados na sessão (null se ainda forem poucos). */
export async function medianaGMDdaSessao(sessaoId: number, ignorarAnimalId?: number): Promise<number | null> {
  const gmds = (await db.pesagens.where("sessaoId").equals(sessaoId).toArray())
    .filter((p) => p.status === "confirmada" && p.animalId !== ignorarAnimalId && p.gmdPeriodo != null
      && p.refFonte !== "compra" && !p.alertas?.length)
    .map((p) => p.gmdPeriodo!);
  return gmds.length >= MINIMO_PARA_MEDIANA ? mediana(gmds) : null;
}

export interface AvaliacaoPeso {
  referencia: Referencia | null;
  dias: number | null;
  /** GMD desde a referência; null se não houver referência ou for no mesmo dia. */
  gmd: number | null;
  medianaSessao: number | null;
  alertas: Alerta[];
}

async function avaliar(sessao: Sessao, ciclo: Ciclo, animal: Animal, peso: number, dataHora: string): Promise<AvaliacaoPeso> {
  // A margem de peso do rebanho vale sempre, mesmo sem referência anterior.
  const margem = alertaMargemPeso(peso, margemDoCiclo(ciclo));
  const referencia = await referenciaDoAnimal(animal, dataHora, sessao.id);
  const medianaSessao = await medianaGMDdaSessao(sessao.id, animal.id);
  if (!referencia) return { referencia, dias: null, gmd: null, medianaSessao, alertas: margem };
  const dias = diasEntre(referencia.data, dataHora);
  if (dias < 1) return { referencia, dias, gmd: null, medianaSessao, alertas: margem };
  const gmd = (peso - referencia.peso) / dias;
  const config = configGMD(ciclo);
  const alertasGMD = referencia.fonte === "compra"
    ? alertaPesoCompra(peso, referencia.peso + gmdCentral(config) * dias)
    : alertasDeGMD(gmd, config, dias, medianaSessao);
  return { referencia, dias, gmd, medianaSessao, alertas: [...margem, ...alertasGMD] };
}

/* ===================== Identificar e pesar ===================== */

export type Identificacao =
  | {
      encontrado: true;
      animal: Animal;
      loteCompra?: LoteCompra;
      referencia: Referencia | null;
      /** Pesagem já feita deste boi nesta sessão, se houver. */
      jaPesado?: Pesagem;
    }
  | { encontrado: false; brinco: string; sugestoes: Animal[] };

/** Passo 1: procura o boi pelo brinco digitado. Se não achar, sugere brincos parecidos. */
export async function identificarBrinco(sessaoId: number, brincoDigitado: string): Promise<Identificacao> {
  const sessao = await exigirSessaoAberta(sessaoId);
  const brinco = normalizarBrinco(brincoDigitado);
  if (!brinco) throw new ErroDeRegra("Informe o número do brinco.");
  const animal = await animalAtivoPorBrinco(sessao.cicloId, brinco);
  if (!animal) {
    const ativos = (await db.animais.where("cicloId").equals(sessao.cicloId).toArray()).filter((a) => a.status === "ativo");
    const parecidos = new Set(brincosParecidos(brinco, ativos.map((a) => a.brinco)));
    return { encontrado: false, brinco, sugestoes: ativos.filter((a) => parecidos.has(a.brinco)) };
  }
  const jaPesado = await db.pesagens.where("[sessaoId+animalId]").equals([sessaoId, animal.id]).first();
  return {
    encontrado: true,
    animal,
    loteCompra: await db.lotesCompra.get(animal.loteCompraId),
    referencia: await referenciaDoAnimal(animal, agora(), sessaoId),
    jaPesado,
  };
}

/** Passo 2 (opcional): calcula GMD e alertas sem salvar, para mostrar antes de confirmar. */
export async function avaliarPeso(sessaoId: number, animalId: number, peso: number, dataHora = agora()): Promise<AvaliacaoPeso> {
  validarPeso(peso);
  const sessao = await exigirSessaoAberta(sessaoId);
  const ciclo = await exigirCicloAtivo(sessao.cicloId);
  return avaliar(sessao, ciclo, await exigirAnimal(animalId), peso, dataHora);
}

export interface ResultadoPesagem {
  pesagemId: number;
  avaliacao: AvaliacaoPeso;
  substituiu: boolean;
}

/**
 * Passo 3: salva o peso do boi na sessão (na hora, sem esperar o fim da sessão).
 * - Boi já pesado na sessão → ErroPesagemDuplicada (use `substituir: true` para trocar).
 * - Peso fora do esperado → ErroAlertaPeso (use `confirmarAlertas: true` se o peso estiver certo).
 */
export async function registrarPesagem(dados: {
  sessaoId: number;
  animalId: number;
  peso: number;
  brincoLido?: string;
  origem?: OrigemPeso;
  observacao?: string;
  substituir?: boolean;
  confirmarAlertas?: boolean;
  dataHora?: string;
}): Promise<ResultadoPesagem> {
  validarPeso(dados.peso);
  const dataHora = dados.dataHora ?? agora();

  return db.transaction("rw", [db.ciclos, db.sessoes, db.lotesCompra, db.animais, db.pesagens], async () => {
    const sessao = await exigirSessaoAberta(dados.sessaoId);
    const ciclo = await exigirCicloAtivo(sessao.cicloId);
    const animal = await exigirAnimal(dados.animalId);
    if (animal.cicloId !== sessao.cicloId) throw new ErroDeRegra("Este boi não pertence ao lote principal da sessão.");
    if (animal.status !== "ativo") throw new ErroDeRegra(`O boi ${animal.brinco} está inativo.`);

    const existente = await db.pesagens.where("[sessaoId+animalId]").equals([sessao.id, animal.id]).first();
    if (existente && !dados.substituir) throw new ErroPesagemDuplicada(existente, animal.brinco);

    const avaliacao = await avaliar(sessao, ciclo, animal, dados.peso, dataHora);
    if (avaliacao.alertas.length && !dados.confirmarAlertas) throw new ErroAlertaPeso(avaliacao);

    const registro: Omit<Pesagem, "id"> = {
      sessaoId: sessao.id,
      animalId: animal.id,
      status: "confirmada",
      brincoLido: normalizarBrinco(dados.brincoLido ?? animal.brinco),
      peso: dados.peso,
      dataHora,
      origem: dados.origem ?? "manual",
      refFonte: avaliacao.referencia?.fonte,
      refPeso: avaliacao.referencia?.peso,
      refData: avaliacao.referencia?.data,
      gmdPeriodo: avaliacao.gmd ?? undefined,
      alertas: avaliacao.alertas.length ? avaliacao.alertas.map((a) => a.tipo) : undefined,
      observacao: textoOuNada(dados.observacao),
    };

    if (existente) {
      await db.pesagens.put({ ...registro, id: existente.id });
      return { pesagemId: existente.id, avaliacao, substituiu: true };
    }
    return { pesagemId: await db.pesagens.add(registro), avaliacao, substituiu: false };
  });
}

export async function excluirPesagem(pesagemId: number): Promise<void> {
  const p = await db.pesagens.get(pesagemId);
  if (!p) return;
  await exigirSessaoAberta(p.sessaoId);
  await db.pesagens.delete(pesagemId);
}

/* ===================== Boi sem brinco (pendentes) ===================== */

/** Salva o peso de um boi sem brinco como PENDENTE, com identificação provisória (SB-1, SB-2...). */
export async function registrarSemBrinco(dados: {
  sessaoId: number; peso: number; origem?: OrigemPeso; observacao?: string; dataHora?: string; confirmarAlertas?: boolean;
}): Promise<{ pesagemId: number; idProvisorio: string }> {
  validarPeso(dados.peso);
  return db.transaction("rw", db.ciclos, db.sessoes, db.pesagens, async () => {
    const sessao = await exigirSessaoAberta(dados.sessaoId);
    const ciclo = await exigirCicloAtivo(sessao.cicloId);
    const alertas = alertaMargemPeso(dados.peso, margemDoCiclo(ciclo));
    if (alertas.length && !dados.confirmarAlertas) {
      throw new ErroAlertaPeso({ referencia: null, dias: null, gmd: null, medianaSessao: null, alertas });
    }
    const provisorios = (await db.pesagens.where("sessaoId").equals(dados.sessaoId).toArray())
      .filter((p) => p.idProvisorio).length;
    const idProvisorio = `SB-${provisorios + 1}`;
    const pesagemId = await db.pesagens.add({
      sessaoId: dados.sessaoId, status: "pendente", idProvisorio, peso: dados.peso,
      dataHora: dados.dataHora ?? agora(), origem: dados.origem ?? "manual",
      alertas: alertas.length ? alertas.map((a) => a.tipo) : undefined,
      observacao: textoOuNada(dados.observacao),
    });
    return { pesagemId, idProvisorio };
  });
}

/** Bois ativos do ciclo que ainda não têm pesagem confirmada nesta sessão. */
export async function animaisFaltantes(sessaoId: number): Promise<Animal[]> {
  const sessao = await db.sessoes.get(sessaoId);
  if (!sessao) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
  const pesados = new Set(
    (await db.pesagens.where("sessaoId").equals(sessaoId).toArray())
      .filter((p) => p.status === "confirmada").map((p) => p.animalId),
  );
  return (await db.animais.where("cicloId").equals(sessao.cicloId).toArray())
    .filter((a) => a.status === "ativo" && !pesados.has(a.id))
    .sort((a, b) => a.brinco.localeCompare(b.brinco, "pt-BR", { numeric: true }));
}

export interface SugestaoPendente {
  animal: Animal;
  /** Peso esperado hoje para este boi (null se não houver referência). */
  esperado: number | null;
  diferenca: number | null;
}

/**
 * Para um boi pesado sem brinco, lista os bois que faltam pesar,
 * do mais provável (peso esperado mais próximo) ao menos provável.
 */
export async function sugerirParaPendente(pesagemId: number, maximo = 5): Promise<SugestaoPendente[]> {
  const p = await db.pesagens.get(pesagemId);
  if (!p || p.status !== "pendente") throw new ErroDeRegra("Pesagem pendente não encontrada.");
  const sessao = await db.sessoes.get(p.sessaoId);
  const ciclo = sessao && (await db.ciclos.get(sessao.cicloId));
  if (!sessao || !ciclo) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
  const gmdRef = (await medianaGMDdaSessao(sessao.id)) ?? gmdCentral(configGMD(ciclo));

  const sugestoes: SugestaoPendente[] = [];
  for (const animal of await animaisFaltantes(sessao.id)) {
    const ref = await referenciaDoAnimal(animal, p.dataHora, sessao.id);
    const esperado = ref ? ref.peso + gmdRef * Math.max(0, diasEntre(ref.data, p.dataHora)) : null;
    sugestoes.push({ animal, esperado, diferenca: esperado == null ? null : Math.abs(p.peso - esperado) });
  }
  return sugestoes
    .sort((a, b) => (a.diferenca ?? Infinity) - (b.diferenca ?? Infinity))
    .slice(0, maximo);
}

/** Liga a pesagem pendente ao boi certo. Se o boi recebeu brinco novo, informe `novoBrinco`. */
export async function resolverPendente(pesagemId: number, animalId: number, novoBrinco?: string): Promise<void> {
  await db.transaction("rw", [db.ciclos, db.sessoes, db.lotesCompra, db.animais, db.pesagens, db.trocasBrinco], async () => {
    const p = await db.pesagens.get(pesagemId);
    if (!p || p.status !== "pendente") throw new ErroDeRegra("Pesagem pendente não encontrada.");
    const sessao = await db.sessoes.get(p.sessaoId);
    if (!sessao) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
    const animal = await exigirAnimal(animalId);
    if (animal.cicloId !== sessao.cicloId || animal.status !== "ativo") {
      throw new ErroDeRegra("Escolha um boi ativo deste lote principal.");
    }
    const ja = await db.pesagens.where("[sessaoId+animalId]").equals([sessao.id, animalId]).first();
    if (ja) throw new ErroDeRegra(`O boi ${animal.brinco} já foi pesado nesta sessão.`);

    if (novoBrinco && normalizarBrinco(novoBrinco) !== animal.brinco) {
      await trocarBrinco(animalId, novoBrinco, "Perdeu o brinco; identificado na pesagem");
    }
    const atualizado = await exigirAnimal(animalId);
    const ref = await referenciaDoAnimal(atualizado, p.dataHora, sessao.id);
    const dias = ref ? diasEntre(ref.data, p.dataHora) : 0;
    await db.pesagens.put({
      ...p,
      animalId,
      status: "confirmada",
      brincoLido: atualizado.brinco,
      refFonte: ref?.fonte,
      refPeso: ref?.peso,
      refData: ref?.data,
      gmdPeriodo: ref && dias >= 1 ? (p.peso - ref.peso) / dias : undefined,
    });
  });
}

/* ===================== Apagar sessão ===================== */

/**
 * Refaz a referência e o GMD de todas as pesagens confirmadas de um boi,
 * em ordem de data (usado depois de apagar pesagens antigas).
 */
export async function recalcularGMDdoAnimal(animalId: number): Promise<void> {
  const animal = await db.animais.get(animalId);
  if (!animal) return;
  const pesagens = (await db.pesagens.where("animalId").equals(animalId).toArray())
    .filter((p) => p.status === "confirmada")
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  for (const p of pesagens) {
    const ref = await referenciaDoAnimal(animal, p.dataHora, p.sessaoId);
    const dias = ref ? diasEntre(ref.data, p.dataHora) : 0;
    await db.pesagens.put({
      ...p,
      refFonte: ref?.fonte,
      refPeso: ref?.peso,
      refData: ref?.data,
      gmdPeriodo: ref && dias >= 1 ? (p.peso - ref.peso) / dias : undefined,
    });
  }
}

/** Quanto será apagado junto com a sessão (para a tela de confirmação). */
export async function resumoExclusaoSessao(sessaoId: number): Promise<{ pesagens: number; pendentes: number; bois: number }> {
  const pesagens = await db.pesagens.where("sessaoId").equals(sessaoId).toArray();
  return {
    pesagens: pesagens.length,
    pendentes: pesagens.filter((p) => p.status === "pendente").length,
    bois: new Set(pesagens.filter((p) => p.animalId != null).map((p) => p.animalId)).size,
  };
}

/**
 * Apaga a sessão e todas as pesagens dela (inclusive pendentes). Os bois continuam cadastrados
 * e trocas de brinco feitas na sessão são mantidas. O GMD das pesagens seguintes desses bois
 * é recalculado com a pesagem anterior que sobrar (ou o peso de entrada).
 */
export async function excluirSessao(sessaoId: number): Promise<{ pesagens: number; boisRecalculados: number }> {
  return db.transaction("rw", [db.sessoes, db.pesagens, db.animais, db.lotesCompra], async () => {
    const sessao = await db.sessoes.get(sessaoId);
    if (!sessao) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
    const pesagens = await db.pesagens.where("sessaoId").equals(sessaoId).toArray();
    const afetados = [...new Set(pesagens.filter((p) => p.animalId != null).map((p) => p.animalId!))];
    await db.pesagens.where("sessaoId").equals(sessaoId).delete();
    await db.sessoes.delete(sessaoId);
    for (const animalId of afetados) await recalcularGMDdoAnimal(animalId);
    return { pesagens: pesagens.length, boisRecalculados: afetados.length };
  });
}
