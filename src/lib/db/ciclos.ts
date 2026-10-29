// Lote principal (ciclo): ex. "Confinamento 2026". Só um ativo por vez.
import { db } from "./banco";
import type { Ciclo } from "./tipos";
import { agora, ErroDeRegra, exigirCiclo, hojeLocal, textoOuNada } from "./comum";
import {
  CONFIG_PADRAO, sugerirMargemDePesos, validarConfigGMD, validarMargemPeso, validarPeso, VARIACAO_PESAGEM_PADRAO,
  type ConfigGMD, type MargemPeso, type ModoFaixa, type SistemaCriacao,
} from "../regras/calculos";

export interface DadosCiclo {
  nome: string;
  sistema: SistemaCriacao;
  modoFaixa?: ModoFaixa;
  gmdEsperado?: number;
  toleranciaPct?: number;
  gmdMin?: number;
  gmdMax?: number;
  variacaoPesagemKg?: number;
  pesoMinimo?: number;
  pesoMaximo?: number;
  pesoAlvoAbate?: number;
  precoArroba?: number;
  rendimentoCarcacaPct?: number;
  dataInicio?: string;
}

/** Configuração de GMD do ciclo, no formato usado pelos cálculos. */
export function configGMD(c: Ciclo): ConfigGMD {
  return {
    modo: c.modoFaixa ?? "faixa",
    gmdEsperado: c.gmdEsperado ?? (c.gmdMin + c.gmdMax) / 2,
    toleranciaPct: c.toleranciaPct ?? 50,
    gmdMin: c.gmdMin,
    gmdMax: c.gmdMax,
    variacaoPesagemKg: c.variacaoPesagemKg ?? VARIACAO_PESAGEM_PADRAO,
  };
}

/** Margem de peso do rebanho do ciclo (pode estar vazia). */
export function margemDoCiclo(c: Ciclo): MargemPeso {
  return { min: c.pesoMinimo, max: c.pesoMaximo };
}

/**
 * Sugere a margem de peso a partir dos pesos de entrada e das pesagens do ciclo.
 * Retorna null se ainda não houver nenhum peso.
 */
export async function sugerirMargem(cicloId: number): Promise<{ min: number; max: number } | null> {
  const c = await exigirCiclo(cicloId);
  const animais = await db.animais.where("cicloId").equals(cicloId).toArray();
  const pesos = animais.filter((a) => a.pesoEntrada != null).map((a) => a.pesoEntrada!);
  const sessoes = new Set((await db.sessoes.where("cicloId").equals(cicloId).toArray()).map((s) => s.id));
  for (const p of await db.pesagens.toArray()) {
    if (sessoes.has(p.sessaoId) && p.status === "confirmada") pesos.push(p.peso);
  }
  return sugerirMargemDePesos(pesos, c.pesoAlvoAbate);
}

function validarMetas(d: Pick<DadosCiclo, "pesoAlvoAbate" | "precoArroba" | "rendimentoCarcacaPct">) {
  if (d.pesoAlvoAbate != null) validarPeso(d.pesoAlvoAbate);
  if (d.precoArroba != null && (!Number.isFinite(d.precoArroba) || d.precoArroba < 0)) {
    throw new ErroDeRegra("Preço da arroba inválido.");
  }
  if (d.rendimentoCarcacaPct != null && !(d.rendimentoCarcacaPct > 30 && d.rendimentoCarcacaPct < 80)) {
    throw new ErroDeRegra("Rendimento de carcaça deve ficar entre 30% e 80%.");
  }
}

export async function cicloAtivo(): Promise<Ciclo | undefined> {
  return db.ciclos.where("status").equals("ativo").first();
}

export async function listarCiclos(): Promise<Ciclo[]> {
  const ciclos = await db.ciclos.toArray();
  return ciclos.sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
}

export async function criarCiclo(dados: DadosCiclo): Promise<number> {
  const nome = dados.nome.trim();
  if (!nome) throw new ErroDeRegra("Informe o nome do lote principal.");
  const padrao = CONFIG_PADRAO[dados.sistema];
  if (!padrao) throw new ErroDeRegra("Sistema de criação inválido.");
  const config: ConfigGMD = {
    modo: dados.modoFaixa ?? "esperado",
    gmdEsperado: dados.gmdEsperado ?? padrao.gmdEsperado,
    toleranciaPct: dados.toleranciaPct ?? padrao.toleranciaPct,
    gmdMin: dados.gmdMin ?? padrao.gmdMin,
    gmdMax: dados.gmdMax ?? padrao.gmdMax,
    variacaoPesagemKg: dados.variacaoPesagemKg ?? VARIACAO_PESAGEM_PADRAO,
  };
  validarConfigGMD(config);
  validarMetas(dados);
  validarMargemPeso({ min: dados.pesoMinimo, max: dados.pesoMaximo });
  return db.transaction("rw", db.ciclos, async () => {
    if (await cicloAtivo()) {
      throw new ErroDeRegra("Já existe um lote principal ativo. Encerre-o antes de criar outro.");
    }
    return db.ciclos.add({
      nome,
      sistema: dados.sistema,
      modoFaixa: config.modo,
      gmdEsperado: config.gmdEsperado,
      toleranciaPct: config.toleranciaPct,
      gmdMin: config.gmdMin,
      gmdMax: config.gmdMax,
      variacaoPesagemKg: config.variacaoPesagemKg,
      pesoMinimo: dados.pesoMinimo,
      pesoMaximo: dados.pesoMaximo,
      pesoAlvoAbate: dados.pesoAlvoAbate,
      precoArroba: dados.precoArroba,
      rendimentoCarcacaPct: dados.rendimentoCarcacaPct,
      dataInicio: textoOuNada(dados.dataInicio) ?? hojeLocal(),
      status: "ativo",
    });
  });
}

/** Atualiza o ciclo. Campos não informados ficam como estão; metas com `null` são apagadas. */
export async function atualizarCiclo(
  id: number,
  dados: Partial<Omit<DadosCiclo, "pesoAlvoAbate" | "precoArroba" | "rendimentoCarcacaPct" | "dataInicio" | "pesoMinimo" | "pesoMaximo">> & {
    pesoMinimo?: number | null;
    pesoMaximo?: number | null;
    pesoAlvoAbate?: number | null;
    precoArroba?: number | null;
    rendimentoCarcacaPct?: number | null;
  },
): Promise<void> {
  const c = await exigirCiclo(id);
  const nome = dados.nome !== undefined ? dados.nome.trim() : c.nome;
  if (!nome) throw new ErroDeRegra("Informe o nome do lote principal.");
  const atual = configGMD(c);
  const config: ConfigGMD = {
    modo: dados.modoFaixa ?? atual.modo,
    gmdEsperado: dados.gmdEsperado ?? atual.gmdEsperado,
    toleranciaPct: dados.toleranciaPct ?? atual.toleranciaPct,
    gmdMin: dados.gmdMin ?? atual.gmdMin,
    gmdMax: dados.gmdMax ?? atual.gmdMax,
    variacaoPesagemKg: dados.variacaoPesagemKg ?? atual.variacaoPesagemKg,
  };
  validarConfigGMD(config);
  const meta = <K extends "pesoAlvoAbate" | "precoArroba" | "rendimentoCarcacaPct" | "pesoMinimo" | "pesoMaximo">(k: K) =>
    dados[k] === null ? undefined : (dados[k] ?? c[k]);
  const metas = {
    pesoAlvoAbate: meta("pesoAlvoAbate"),
    precoArroba: meta("precoArroba"),
    rendimentoCarcacaPct: meta("rendimentoCarcacaPct"),
    pesoMinimo: meta("pesoMinimo"),
    pesoMaximo: meta("pesoMaximo"),
  };
  validarMetas(metas);
  validarMargemPeso({ min: metas.pesoMinimo, max: metas.pesoMaximo });
  await db.ciclos.put({
    ...c,
    nome,
    sistema: dados.sistema ?? c.sistema,
    modoFaixa: config.modo,
    gmdEsperado: config.gmdEsperado,
    toleranciaPct: config.toleranciaPct,
    gmdMin: config.gmdMin,
    gmdMax: config.gmdMax,
    variacaoPesagemKg: config.variacaoPesagemKg,
    ...metas,
  });
}

/** Encerra o ciclo (vira histórico). Não pode haver sessão de pesagem aberta. */
export async function encerrarCiclo(id: number): Promise<void> {
  await db.transaction("rw", db.ciclos, db.sessoes, async () => {
    await exigirCiclo(id);
    const aberta = await db.sessoes.where("cicloId").equals(id).filter((s) => !s.encerradaEm).first();
    if (aberta) throw new ErroDeRegra("Encerre a sessão de pesagem aberta antes de encerrar o lote principal.");
    await db.ciclos.update(id, { status: "encerrado", encerradoEm: agora() });
  });
}
