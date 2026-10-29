// Leitura de planilhas CSV (exportadas do Excel) para cadastrar bois em lote.

/** Separa um CSV em linhas e células. Aceita ";" ou "," e células entre aspas. */
export function lerCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { celula += '"'; i++; }
      else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(celula); celula = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(celula); linhas.push(linha); linha = []; celula = "";
    } else celula += c;
  }
  if (celula !== "" || linha.length) { linha.push(celula); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

/** "430,5" / "430.5" / "1.234,5" → número; vazio → undefined; inválido → NaN. */
export function lerNumeroBR(s: string | undefined): number | undefined {
  const t = (s ?? "").trim().replace(/\s/g, "");
  if (!t) return undefined;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

/** "16/10/2026" ou "2026-10-16" → "2026-10-16"; vazio → undefined; inválido → null. */
export function lerDataBR(s: string | undefined): string | undefined | null {
  const t = (s ?? "").trim();
  if (!t) return undefined;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? t : null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Colunas aceitas na planilha de bois (o nome no cabeçalho pode variar um pouco). */
export const COLUNAS_ANIMAIS = {
  brinco: ["brinco", "numero", "n brinco", "manejo"],
  loteCompra: ["lote de compra", "lote compra", "lote"],
  raca: ["raca"],
  pesoEntrada: ["peso de entrada", "peso entrada", "peso (kg)", "peso"],
  dataEntrada: ["data de entrada", "data entrada", "entrada"],
  observacao: ["observacao", "obs"],
} as const;

export type ColunaAnimal = keyof typeof COLUNAS_ANIMAIS;

/** Descobre em qual coluna está cada campo, pelo cabeçalho. */
export function mapearCabecalho(cabecalho: string[]): Partial<Record<ColunaAnimal, number>> {
  const nomes = cabecalho.map(semAcento);
  const mapa: Partial<Record<ColunaAnimal, number>> = {};
  for (const [campo, apelidos] of Object.entries(COLUNAS_ANIMAIS) as [ColunaAnimal, readonly string[]][]) {
    const i = nomes.findIndex((n) => apelidos.includes(n));
    if (i >= 0) mapa[campo] = i;
  }
  return mapa;
}

/**
 * Colunas de pesagens com data no cabeçalho: "Peso 15/02/2026", "Peso em 15/02/2026",
 * "15/02/2026" ou "2026-02-15". Retorna a coluna e a data (AAAA-MM-DD).
 */
export function colunasDePesagem(cabecalho: string[]): { coluna: number; data: string }[] {
  const conhecidas = new Set(Object.values(mapearCabecalho(cabecalho)));
  const colunas: { coluna: number; data: string }[] = [];
  cabecalho.forEach((titulo, coluna) => {
    if (conhecidas.has(coluna)) return;
    const m = /^(?:peso\s*(?:em|de|do dia)?\s*)?(\S+)$/.exec(semAcento(titulo));
    const data = m ? lerDataBR(m[1]) : null;
    if (data) colunas.push({ coluna, data });
  });
  return colunas;
}

/** Linhas da planilha-modelo (o app gera o .xlsx a partir delas). */
export const MODELO_PLANILHA_ANIMAIS: (string | number)[][] = [
  ["Brinco", "Lote de compra", "Raça", "Peso de entrada", "Data de entrada", "Observação", "Peso 15/02/2026"],
  ["0123", "Fazenda Boa Vista", "Nelore", 380, "10/01/2026", "", 425],
];
