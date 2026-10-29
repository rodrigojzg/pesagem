// Leitura e geração de planilhas Excel (.xlsx) e CSV.
// A biblioteca SheetJS só é baixada quando o usuário usa uma dessas funções,
// para o app continuar leve ao abrir.
import { lerCSV, mapearCabecalho, MODELO_PLANILHA_ANIMAIS } from "../regras/importacao";
import { compartilharArquivo } from "./compartilhar";

export interface PlanilhaLida {
  linhas: string[][];
  /** Quantos brincos vieram como número (o Excel apaga zeros à esquerda desses). */
  brincosNumericos: number;
}

/** Data de uma célula do Excel → "AAAA-MM-DD", sem trocar de dia por causa do fuso. */
function dataDaCelula(d: Date): string {
  return new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
}

export const TIPOS_ACEITOS =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

/** Lê a 1ª aba de um .xlsx/.xls ou um .csv e devolve as linhas como texto. */
export async function lerPlanilha(arquivo: File): Promise<PlanilhaLida> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
    return { linhas: lerCSV(await arquivo.text()), brincosNumericos: 0 };
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true });
  const aba = wb.Sheets[wb.SheetNames[0]];
  if (!aba) return { linhas: [], brincosNumericos: 0 };
  const bruto = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: "" });
  const linhas = bruto.map((l) =>
    l.map((c) => (c instanceof Date ? dataDaCelula(c) : typeof c === "number" ? String(c) : String(c ?? "").trim())),
  );
  const colBrinco = linhas.length ? mapearCabecalho(linhas[0]).brinco : undefined;
  const brincosNumericos = colBrinco == null ? 0 : bruto.slice(1).filter((l) => typeof l[colBrinco] === "number").length;
  return { linhas, brincosNumericos };
}

/** Gera o modelo .xlsx com a coluna Brinco formatada como texto (mantém zeros à esquerda). */
export async function baixarModeloPlanilha(): Promise<void> {
  const XLSX = await import("xlsx");
  const colunas = MODELO_PLANILHA_ANIMAIS[0].length;
  const aba = XLSX.utils.aoa_to_sheet(MODELO_PLANILHA_ANIMAIS);
  for (let r = 1; r <= 1000; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 0 });
    const celula = aba[ref] ?? { t: "s", v: "" };
    celula.t = "s";
    celula.z = "@";
    aba[ref] = celula;
  }
  aba["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: colunas - 1 } });
  aba["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 18 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, "Bois");
  const dados = XLSX.write(livro, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  await compartilharArquivo(
    "modelo-bois.xlsx", dados, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
