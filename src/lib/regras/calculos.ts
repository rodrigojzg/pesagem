// Cálculos puros (sem banco de dados): fáceis de testar e reutilizar.
import { ErroDeRegra } from "./erros";

/** Limite de segurança contra erro de digitação ou leitura (kg). */
export const PESO_MAXIMO_KG = 2000;

/* ===================== Brinco ===================== */

/** Padroniza o número do brinco: sem espaços e em maiúsculas. Mantém zeros à esquerda. */
export function normalizarBrinco(brinco: string): string {
  return (brinco ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Quantas edições separam dois brincos: trocar, inserir ou apagar um caractere,
 * ou inverter dois caracteres vizinhos (erro de digitação mais comum).
 */
export function distanciaBrinco(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Brincos cadastrados a 1 erro de digitação do brinco digitado (ex.: 0132 → 0123). */
export function brincosParecidos(digitado: string, existentes: string[], maximo = 5): string[] {
  const alvo = normalizarBrinco(digitado);
  return existentes
    .filter((b) => b !== alvo && distanciaBrinco(alvo, b) <= 1)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .slice(0, maximo);
}

/* ===================== Peso ===================== */

/** Lança ErroDeRegra se o peso não for um número válido e plausível. */
export function validarPeso(peso: number): void {
  if (typeof peso !== "number" || !Number.isFinite(peso)) {
    throw new ErroDeRegra("Peso inválido.");
  }
  if (peso <= 0) throw new ErroDeRegra("O peso deve ser maior que zero.");
  if (peso > PESO_MAXIMO_KG) {
    throw new ErroDeRegra(`Peso acima do limite de ${PESO_MAXIMO_KG} kg.`);
  }
}

export interface ResumoPesos {
  quantidade: number;
  total: number;
  media: number | null;
  minimo: number | null;
  maximo: number | null;
}

/** Nº de animais, peso total, médio, mínimo e máximo. */
export function resumoPesos(pesos: number[]): ResumoPesos {
  if (pesos.length === 0) {
    return { quantidade: 0, total: 0, media: null, minimo: null, maximo: null };
  }
  const total = pesos.reduce((s, p) => s + p, 0);
  return {
    quantidade: pesos.length,
    total,
    media: total / pesos.length,
    minimo: Math.min(...pesos),
    maximo: Math.max(...pesos),
  };
}

export function media(valores: number[]): number | null {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
}

/** Valor do meio da lista ordenada; não se deixa distorcer por poucos valores errados. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/* ===================== GMD ===================== */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Nº do dia no calendário (no fuso do aparelho), para contar dias sem depender do horário. */
function diaCivil(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS_POR_DIA;
  const d = new Date(data);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_POR_DIA;
}

/** Dias de calendário entre duas datas ("AAAA-MM-DD" ou ISO), ignorando o horário. */
export function diasEntre(inicio: string, fim: string): number {
  return diaCivil(fim) - diaCivil(inicio);
}

/**
 * Ganho médio diário em kg/dia.
 * Retorna null se as pesagens tiverem menos de 1 dia de intervalo.
 */
export function calcularGMD(
  pesoInicial: number,
  dataInicial: string,
  pesoFinal: number,
  dataFinal: string,
): number | null {
  const dias = diasEntre(dataInicial, dataFinal);
  if (dias < 1) return null;
  return (pesoFinal - pesoInicial) / dias;
}

export interface PontoHistorico {
  dataHora: string;
  peso: number;
  /** Em relação ao ponto anterior (null no primeiro). */
  dias: number | null;
  ganho: number | null;
  gmd: number | null;
}

export interface Historico {
  pontos: PontoHistorico[];
  ganhoTotal: number | null;
  diasTotal: number | null;
  /** Do primeiro ao último ponto. */
  gmdTotal: number | null;
}

/** Ordena os pesos por data e calcula ganho e GMD entre cada um. */
export function historicoComGMD(pesagens: { dataHora: string; peso: number }[]): Historico {
  const ordenadas = [...pesagens].sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const pontos: PontoHistorico[] = ordenadas.map((p, i) => {
    if (i === 0) return { dataHora: p.dataHora, peso: p.peso, dias: null, ganho: null, gmd: null };
    const ant = ordenadas[i - 1];
    return {
      dataHora: p.dataHora,
      peso: p.peso,
      dias: diasEntre(ant.dataHora, p.dataHora),
      ganho: p.peso - ant.peso,
      gmd: calcularGMD(ant.peso, ant.dataHora, p.peso, p.dataHora),
    };
  });
  if (ordenadas.length < 2) {
    return { pontos, ganhoTotal: null, diasTotal: null, gmdTotal: null };
  }
  const primeira = ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];
  return {
    pontos,
    ganhoTotal: ultima.peso - primeira.peso,
    diasTotal: diasEntre(primeira.dataHora, ultima.dataHora),
    gmdTotal: calcularGMD(primeira.peso, primeira.dataHora, ultima.peso, ultima.dataHora),
  };
}

/* ===================== Alertas de peso ===================== */

export interface FaixaGMD {
  min: number;
  max: number;
}

export type SistemaCriacao = "confinamento" | "semiconfinamento" | "pasto";
export type ModoFaixa = "esperado" | "faixa";

/** Como o usuário define o GMD plausível do ciclo. */
export interface ConfigGMD {
  modo: ModoFaixa;
  /** Modo "esperado": GMD esperado (kg/dia) ± tolerância (%). */
  gmdEsperado: number;
  toleranciaPct: number;
  /** Modo "faixa": mínimo e máximo (kg/dia). */
  gmdMin: number;
  gmdMax: number;
  /** Quanto o peso de um boi varia sem ganho real (enchimento do rúmen etc.), em kg. */
  variacaoPesagemKg: number;
}

/** Valores iniciais sugeridos por sistema; o usuário ajusta em Ajustes. */
export const CONFIG_PADRAO: Record<SistemaCriacao, Omit<ConfigGMD, "modo" | "variacaoPesagemKg">> = {
  confinamento: { gmdEsperado: 1.4, toleranciaPct: 50, gmdMin: -0.5, gmdMax: 2.5 },
  semiconfinamento: { gmdEsperado: 1.0, toleranciaPct: 50, gmdMin: -0.5, gmdMax: 2.0 },
  pasto: { gmdEsperado: 0.5, toleranciaPct: 50, gmdMin: -1.0, gmdMax: 1.5 },
};
export const VARIACAO_PESAGEM_PADRAO = 15;
/** No modo "esperado", a faixa nunca fica mais estreita que ± este valor (kg/dia). */
export const LARGURA_MINIMA = 0.5;
/** A partir de quantos bois pesados a mediana da sessão passa a ser usada. */
export const MINIMO_PARA_MEDIANA = 10;
/** Diferença máxima (kg/dia) entre o GMD do boi e a mediana da sessão, antes da correção por intervalo. */
export const DESVIO_MAXIMO_MEDIANA = 1.0;
/** Tolerância quando a única referência é o peso médio de entrada do lote de compra. */
export const TOLERANCIA_PESO_COMPRA = 0.25;

/** GMD "central" da configuração (usado em estimativas de peso esperado). */
export function gmdCentral(c: ConfigGMD): number {
  return c.modo === "esperado" ? c.gmdEsperado : (c.gmdMin + c.gmdMax) / 2;
}

/** Folga extra (kg/dia) por causa da variação de pesagem: maior em intervalos curtos. */
export function folgaPorIntervalo(c: ConfigGMD, dias: number): number {
  return dias >= 1 ? c.variacaoPesagemKg / dias : Infinity;
}

/** Faixa de GMD plausível para um intervalo de `dias` entre as pesagens. */
export function faixaParaIntervalo(c: ConfigGMD, dias: number): FaixaGMD {
  let base: FaixaGMD;
  if (c.modo === "esperado") {
    const meia = Math.max(Math.abs(c.gmdEsperado) * c.toleranciaPct / 100, LARGURA_MINIMA);
    base = { min: c.gmdEsperado - meia, max: c.gmdEsperado + meia };
  } else {
    base = { min: c.gmdMin, max: c.gmdMax };
  }
  const folga = folgaPorIntervalo(c, dias);
  return { min: base.min - folga, max: base.max + folga };
}

/** Lança ErroDeRegra se a configuração não fizer sentido. */
export function validarConfigGMD(c: ConfigGMD): void {
  const nums = [c.gmdEsperado, c.toleranciaPct, c.gmdMin, c.gmdMax, c.variacaoPesagemKg];
  if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) throw new ErroDeRegra("Preencha a configuração de GMD.");
  if (c.modo === "faixa" && c.gmdMin >= c.gmdMax) throw new ErroDeRegra("O GMD mínimo deve ser menor que o máximo.");
  if (c.toleranciaPct < 0 || c.toleranciaPct > 300) throw new ErroDeRegra("Tolerância deve ficar entre 0% e 300%.");
  if (c.variacaoPesagemKg < 0 || c.variacaoPesagemKg > 100) throw new ErroDeRegra("Variação de pesagem deve ficar entre 0 e 100 kg.");
}

export type TipoAlerta = "gmd-fora-da-faixa" | "gmd-distante-da-mediana" | "peso-distante-da-compra" | "peso-fora-da-margem";

export interface Alerta {
  tipo: TipoAlerta;
  mensagem: string;
}

const kgDia = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2).replace(".", ",")} kg/dia`;

/**
 * Confere se o GMD implícito é plausível para o intervalo. Lista vazia = sem alerta.
 * A faixa e a tolerância da mediana se alargam em intervalos curtos.
 */
export function alertasDeGMD(gmd: number, config: ConfigGMD, dias: number, medianaSessao: number | null): Alerta[] {
  const faixa = faixaParaIntervalo(config, dias);
  if (gmd < faixa.min || gmd > faixa.max) {
    return [{
      tipo: "gmd-fora-da-faixa",
      mensagem: `Ganho de ${kgDia(gmd)} está fora do esperado para ${dias} dias (${kgDia(faixa.min)} a ${kgDia(faixa.max)}).`,
    }];
  }
  const limite = DESVIO_MAXIMO_MEDIANA + folgaPorIntervalo(config, dias);
  if (medianaSessao != null && Math.abs(gmd - medianaSessao) > limite) {
    return [{
      tipo: "gmd-distante-da-mediana",
      mensagem: `Ganho de ${kgDia(gmd)} está muito diferente do restante da sessão (${kgDia(medianaSessao)}).`,
    }];
  }
  return [];
}

/** Quando só há o peso médio de entrada do lote: confere se o peso está dentro da tolerância. */
export function alertaPesoCompra(peso: number, esperado: number): Alerta[] {
  const diferenca = Math.abs(peso - esperado) / esperado;
  if (diferenca <= TOLERANCIA_PESO_COMPRA) return [];
  return [{
    tipo: "peso-distante-da-compra",
    mensagem: `Peso muito diferente do esperado pelo lote de compra (~${Math.round(esperado)} kg).`,
  }];
}

/* ===================== Margem de peso do rebanho ===================== */

export interface MargemPeso {
  min?: number;
  max?: number;
}

/** Alerta se o peso estiver fora da margem do rebanho definida pelo produtor. */
export function alertaMargemPeso(peso: number, margem: MargemPeso): Alerta[] {
  const { min, max } = margem;
  if ((min != null && peso < min) || (max != null && peso > max)) {
    const faixa = min != null && max != null ? `${min} a ${max} kg`
      : min != null ? `mínimo ${min} kg` : `máximo ${max} kg`;
    return [{
      tipo: "peso-fora-da-margem",
      mensagem: `${String(peso).replace(".", ",")} kg está fora da margem de peso do rebanho (${faixa}).`,
    }];
  }
  return [];
}

/** Lança ErroDeRegra se a margem não fizer sentido. */
export function validarMargemPeso(m: MargemPeso): void {
  if (m.min != null) validarPeso(m.min);
  if (m.max != null) validarPeso(m.max);
  if (m.min != null && m.max != null && m.min >= m.max) {
    throw new ErroDeRegra("O peso mínimo da margem deve ser menor que o máximo.");
  }
}

/**
 * Sugere uma margem a partir dos pesos conhecidos: 10% abaixo do menor e 10% acima
 * do maior (ou do peso-alvo de abate, se for maior), arredondando para dezenas.
 */
export function sugerirMargemDePesos(pesos: number[], pesoAlvo?: number): { min: number; max: number } | null {
  if (!pesos.length) return null;
  const menor = Math.min(...pesos);
  const maior = Math.max(...pesos, pesoAlvo ?? 0);
  // arredonda antes de floor/ceil para evitar erros de ponto flutuante (400 × 1,1 = 440,00000000000006)
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { min: Math.max(10, Math.floor(r((menor * 0.9) / 10)) * 10), max: Math.ceil(r((maior * 1.1) / 10)) * 10 };
}

/* ===================== Abate e arrobas ===================== */

/** Peso da arroba de carcaça (kg). */
export const KG_POR_ARROBA = 15;

/** Arrobas de carcaça a partir do peso vivo e do rendimento de carcaça (%). */
export function arrobas(pesoVivoKg: number, rendimentoPct: number): number {
  return (pesoVivoKg * rendimentoPct) / 100 / KG_POR_ARROBA;
}

/** Dias até o peso-alvo com o GMD atual (null se não chega: GMD ≤ 0). 0 se já chegou. */
export function diasAteAlvo(pesoAtual: number, alvo: number, gmd: number): number | null {
  if (pesoAtual >= alvo) return 0;
  if (gmd <= 0) return null;
  return Math.ceil((alvo - pesoAtual) / gmd);
}

/** Agrupa valores em faixas de largura fixa (para histogramas). */
export function histograma(valores: number[], largura: number): { inicio: number; fim: number; quantidade: number }[] {
  if (!valores.length) return [];
  const min = Math.floor(Math.min(...valores) / largura) * largura;
  const max = Math.max(...valores);
  const faixas: { inicio: number; fim: number; quantidade: number }[] = [];
  for (let ini = min; ini <= max; ini = Math.round((ini + largura) * 1e6) / 1e6) {
    faixas.push({ inicio: ini, fim: Math.round((ini + largura) * 1e6) / 1e6, quantidade: 0 });
  }
  for (const v of valores) {
    const i = Math.min(faixas.length - 1, Math.floor((v - min) / largura + 1e-9));
    faixas[i].quantidade++;
  }
  return faixas;
}
