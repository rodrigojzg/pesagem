// Modelo de dados do app. Datas: "AAAA-MM-DD" (só data) ou ISO completo (data e hora).
import type { ModoFaixa, SistemaCriacao, TipoAlerta } from "../regras/calculos";

/**
 * Lote principal de um ciclo (ex.: "Confinamento 2026").
 * Só um fica ativo por vez; ao encerrar, vira histórico.
 */
export interface Ciclo {
  id: number;
  nome: string;
  sistema: SistemaCriacao;
  /** Como o GMD plausível é definido: "esperado ± tolerância" ou "faixa mínimo–máximo". */
  modoFaixa: ModoFaixa;
  gmdEsperado: number; // kg/dia
  toleranciaPct: number; // %
  gmdMin: number; // kg/dia
  gmdMax: number; // kg/dia
  /** Variação de peso sem ganho real (enchimento do rúmen etc.), em kg. */
  variacaoPesagemKg: number;
  /** Margem de peso do rebanho (kg): pesos fora dela geram alerta. Opcional. */
  pesoMinimo?: number;
  pesoMaximo?: number;
  /** Metas e valores (opcionais), usados na aba Resultados. */
  pesoAlvoAbate?: number; // kg
  precoArroba?: number; // R$ por @ de carcaça
  rendimentoCarcacaPct?: number; // %
  dataInicio: string; // AAAA-MM-DD
  status: "ativo" | "encerrado";
  encerradoEm?: string; // ISO
}

/** Lote de compra: bois comprados juntos, dentro de um ciclo. */
export interface LoteCompra {
  id: number;
  cicloId: number;
  nome: string;
  dataCompra?: string; // AAAA-MM-DD
  fornecedor?: string;
  /** Valor total pago pelo lote (R$). O peso médio é calculado pelos pesos de entrada dos bois. */
  valorPago?: number;
  observacao?: string;
}

export type StatusAnimal = "ativo" | "inativo"; // inativo = vendido, morto etc.

export interface Animal {
  id: number;
  cicloId: number;
  loteCompraId: number;
  /** Brinco atual, normalizado (sem espaços, maiúsculas). */
  brinco: string;
  raca?: string;
  pesoEntrada?: number; // kg
  dataEntrada?: string; // AAAA-MM-DD
  observacao?: string;
  status: StatusAnimal;
  criadoEm: string; // ISO
}

/** Registro de cada vez que um boi recebeu brinco novo. */
export interface TrocaBrinco {
  id: number;
  animalId: number;
  brincoAnterior: string;
  brincoNovo: string;
  data: string; // ISO
  motivo?: string;
}

/** Um dia de manejo em que os bois do ciclo são pesados. */
export interface Sessao {
  id: number;
  cicloId: number;
  data: string; // AAAA-MM-DD
  descricao?: string;
  /** true se a sessão veio de uma planilha importada. */
  importada?: boolean;
  abertaEm: string; // ISO
  encerradaEm?: string; // ISO
}

export type OrigemPeso = "balanca" | "manual";
export type FonteReferencia = "pesagem" | "entrada" | "compra";

export interface Pesagem {
  id: number;
  sessaoId: number;
  /** Vazio enquanto a pesagem estiver pendente (boi sem brinco). */
  animalId?: number;
  status: "confirmada" | "pendente";
  /** Identificação provisória do boi sem brinco (ex.: "SB-1"). */
  idProvisorio?: string;
  /** Brinco como foi digitado/lido na hora. */
  brincoLido?: string;
  peso: number; // kg
  dataHora: string; // ISO
  origem: OrigemPeso;
  /** Referência usada para o GMD do período (pesagem anterior, entrada ou compra). */
  refFonte?: FonteReferencia;
  refPeso?: number;
  refData?: string;
  /** GMD desde a referência (kg/dia). */
  gmdPeriodo?: number;
  /** Alertas que o operador viu e confirmou. */
  alertas?: TipoAlerta[];
  observacao?: string;
}
