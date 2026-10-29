// Utilidades compartilhadas pelos módulos do banco.
import { db } from "./banco";
import { ErroDeRegra } from "../regras/erros";
import type { Animal, Ciclo, LoteCompra, Sessao } from "./tipos";

export { ErroDeRegra };

export const agora = () => new Date().toISOString();

/** Data de hoje no fuso do aparelho, "AAAA-MM-DD". */
export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Texto opcional: "" ou só espaços viram undefined. */
export const textoOuNada = (s?: string) => (s && s.trim() ? s.trim() : undefined);

export async function exigirCiclo(id: number): Promise<Ciclo> {
  const c = await db.ciclos.get(id);
  if (!c) throw new ErroDeRegra("Lote principal não encontrado.");
  return c;
}

export async function exigirCicloAtivo(id: number): Promise<Ciclo> {
  const c = await exigirCiclo(id);
  if (c.status !== "ativo") throw new ErroDeRegra("Este lote principal já foi encerrado.");
  return c;
}

export async function exigirLoteCompra(id: number, cicloId: number): Promise<LoteCompra> {
  const l = await db.lotesCompra.get(id);
  if (!l || l.cicloId !== cicloId) throw new ErroDeRegra("Lote de compra não encontrado neste lote principal.");
  return l;
}

export async function exigirAnimal(id: number): Promise<Animal> {
  const a = await db.animais.get(id);
  if (!a) throw new ErroDeRegra("Boi não encontrado.");
  return a;
}

export async function exigirSessaoAberta(id: number): Promise<Sessao> {
  const s = await db.sessoes.get(id);
  if (!s) throw new ErroDeRegra("Sessão de pesagem não encontrada.");
  if (s.encerradaEm) throw new ErroDeRegra("Esta sessão já foi encerrada.");
  return s;
}

/** Boi ativo com este brinco no ciclo (ou undefined). */
export async function animalAtivoPorBrinco(cicloId: number, brinco: string): Promise<Animal | undefined> {
  return db.animais
    .where("[cicloId+brinco]")
    .equals([cicloId, brinco])
    .filter((a) => a.status === "ativo")
    .first();
}
