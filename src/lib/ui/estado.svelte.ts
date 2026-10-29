// Estado global da interface: tela atual, avisos (toast) e lote principal ativo.
import { cicloAtivo, sessaoAberta, type Ciclo, type Sessao } from "../db/repositorio";

export type Tela =
  | { nome: "inicio" }
  | { nome: "rebanho"; aba?: "bois" | "lotes" }
  | { nome: "boi"; id?: number }
  | { nome: "lote"; id?: number }
  | { nome: "sessoes" }
  | { nome: "sessao"; id: number }
  | { nome: "pesar" }
  | { nome: "resultados" }
  | { nome: "ajustes" }
  | { nome: "ciclo"; novo?: boolean }
  | { nome: "backup" }
  | { nome: "tutorialPlanilha" }
  | { nome: "dispositivos" };

export type Aviso = { tipo: "erro" | "sucesso" | "info"; titulo: string; texto?: string };

export const app = $state({
  tela: { nome: "inicio" } as Tela,
  historico: [] as Tela[],
  aviso: null as Aviso | null,
  ciclo: undefined as Ciclo | undefined,
  sessaoAberta: undefined as Sessao | undefined,
  carregado: false,
});

/** Abre uma tela "por cima" (com botão voltar). */
export function ir(tela: Tela) {
  app.historico.push(app.tela);
  app.tela = tela;
  window.scrollTo(0, 0);
}

export function voltar() {
  app.tela = app.historico.pop() ?? { nome: "inicio" };
  window.scrollTo(0, 0);
}

/** Troca de aba na barra inferior (limpa o histórico). */
export function aba(tela: Tela) {
  app.historico = [];
  app.tela = tela;
  window.scrollTo(0, 0);
}

let temporizador: ReturnType<typeof setTimeout> | undefined;

export function avisar(tipo: Aviso["tipo"], titulo: string, texto?: string, duracaoMs = 4000) {
  app.aviso = { tipo, titulo, texto };
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (app.aviso = null), duracaoMs);
}

export function avisarErro(e: unknown) {
  avisar("erro", "Ops, tivemos um problema!", e instanceof Error ? e.message : String(e), 6000);
}

/** Recarrega o lote principal ativo e a sessão aberta (chamar após mudanças). */
export async function recarregar() {
  app.ciclo = await cicloAtivo();
  app.sessaoAberta = app.ciclo ? await sessaoAberta(app.ciclo.id) : undefined;
  app.carregado = true;
}

/** Converte texto digitado ("430,5") em número; vazio → undefined. */
export function numero(texto: string): number | undefined {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return undefined;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : Number.NaN;
}
