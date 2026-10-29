// Geração de CSV no padrão do Excel em português:
// separador ";", vírgula decimal e BOM para os acentos aparecerem certos.

export type Celula = string | number | null | undefined;

/** 430 -> "430"; 1.2345 -> "1,235" (até `casas` decimais, sem separador de milhar). */
export function formatarNumeroBR(n: number, casas = 3): string {
  if (!Number.isFinite(n)) return "";
  const fator = 10 ** casas;
  const r = Math.round(n * fator) / fator;
  return String(Object.is(r, -0) ? 0 : r).replace(".", ",");
}

const dois = (n: number) => String(n).padStart(2, "0");

/** "2026-10-16" ou ISO completo -> "16/10/2026" (data local). */
export function formatarDataBR(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(data);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO -> "16/10/2026 08:30" no fuso do aparelho. */
export function formatarDataHoraBR(iso: string): string {
  const d = new Date(iso);
  return `${formatarDataBR(iso)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

function textoDaCelula(c: Celula): string {
  if (c == null) return "";
  if (typeof c === "number") return formatarNumeroBR(c);
  let s = String(c);
  // Evita que o Excel interprete o texto como fórmula.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function gerarCSV(cabecalho: string[], linhas: Celula[][]): string {
  const todas = [cabecalho, ...linhas].map((l) => l.map(textoDaCelula).join(";"));
  return "﻿" + todas.join("\r\n") + "\r\n";
}
