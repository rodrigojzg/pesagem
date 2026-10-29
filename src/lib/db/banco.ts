// Banco de dados local (IndexedDB) via Dexie. Fica no próprio aparelho e funciona sem internet.
import Dexie, { type EntityTable } from "dexie";
import type { Animal, Ciclo, LoteCompra, Pesagem, Sessao, TrocaBrinco } from "./tipos";

export const db = new Dexie("pesagem-gado") as Dexie & {
  ciclos: EntityTable<Ciclo, "id">;
  lotesCompra: EntityTable<LoteCompra, "id">;
  animais: EntityTable<Animal, "id">;
  trocasBrinco: EntityTable<TrocaBrinco, "id">;
  sessoes: EntityTable<Sessao, "id">;
  pesagens: EntityTable<Pesagem, "id">;
};

// "++id" = chave automática; os demais campos são índices para busca rápida.
// Nunca altere uma versão antiga: crie a seguinte (version(3)...), como foi feito com a 2.
const TABELAS_V1 = {
  ciclos: "++id, status",
  lotesCompra: "++id, cicloId",
  animais: "++id, cicloId, loteCompraId, brinco, [cicloId+brinco], status",
  trocasBrinco: "++id, animalId",
  sessoes: "++id, cicloId, data",
  pesagens: "++id, sessaoId, animalId, [sessaoId+animalId], status, dataHora",
};
db.version(1).stores(TABELAS_V1);

// Versão 2: faixa de GMD em dois modos e metas do ciclo.
// Os índices não mudam; só preenchemos os campos novos nos ciclos que já existiam.
db.version(2).stores(TABELAS_V1).upgrade((tx) =>
  tx.table("ciclos").toCollection().modify((c: Partial<Ciclo>) => {
    c.modoFaixa ??= "faixa";
    c.gmdEsperado ??= ((c.gmdMin ?? 0) + (c.gmdMax ?? 2)) / 2;
    c.toleranciaPct ??= 50;
    c.variacaoPesagemKg ??= 15;
  }),
);
