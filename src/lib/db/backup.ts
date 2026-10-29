// Backup completo do banco em JSON, para guardar fora do celular e restaurar depois.
import { db } from "./banco";
import type { Animal, Ciclo, LoteCompra, Pesagem, Sessao, TrocaBrinco } from "./tipos";
import { ErroDeRegra } from "../regras/erros";

export interface Backup {
  app: "pesagem-gado";
  versao: 1;
  exportadoEm: string;
  ciclos: Ciclo[];
  lotesCompra: LoteCompra[];
  animais: Animal[];
  trocasBrinco: TrocaBrinco[];
  sessoes: Sessao[];
  pesagens: Pesagem[];
}

const TABELAS = ["ciclos", "lotesCompra", "animais", "trocasBrinco", "sessoes", "pesagens"] as const;

export async function gerarBackup(): Promise<Backup> {
  return db.transaction("r", db.tables, async () => ({
    app: "pesagem-gado" as const,
    versao: 1 as const,
    exportadoEm: new Date().toISOString(),
    ciclos: await db.ciclos.toArray(),
    lotesCompra: await db.lotesCompra.toArray(),
    animais: await db.animais.toArray(),
    trocasBrinco: await db.trocasBrinco.toArray(),
    sessoes: await db.sessoes.toArray(),
    pesagens: await db.pesagens.toArray(),
  }));
}

/** Substitui TODOS os dados do aparelho pelos do backup. Retorna quantos registros de cada tipo. */
export async function restaurarBackup(dados: unknown): Promise<Record<(typeof TABELAS)[number], number>> {
  const b = dados as Partial<Backup> | null;
  if (!b || b.app !== "pesagem-gado" || b.versao !== 1) {
    throw new ErroDeRegra("Arquivo de backup inválido ou de outra versão.");
  }
  for (const t of TABELAS) {
    if (!Array.isArray(b[t])) throw new ErroDeRegra(`Backup incompleto: falta "${t}".`);
  }
  const backup = b as Backup;
  await db.transaction("rw", db.tables, async () => {
    for (const t of TABELAS) await db[t].clear();
    // Backups da versão anterior não têm os campos novos do ciclo: preenche com os padrões.
    await db.ciclos.bulkPut(backup.ciclos.map((c) => ({
      ...c,
      modoFaixa: c.modoFaixa ?? "faixa",
      gmdEsperado: c.gmdEsperado ?? (c.gmdMin + c.gmdMax) / 2,
      toleranciaPct: c.toleranciaPct ?? 50,
      variacaoPesagemKg: c.variacaoPesagemKg ?? 15,
    })));
    await db.lotesCompra.bulkPut(backup.lotesCompra);
    await db.animais.bulkPut(backup.animais);
    await db.trocasBrinco.bulkPut(backup.trocasBrinco);
    await db.sessoes.bulkPut(backup.sessoes);
    await db.pesagens.bulkPut(backup.pesagens);
  });
  return Object.fromEntries(TABELAS.map((t) => [t, backup[t].length])) as Record<(typeof TABELAS)[number], number>;
}
