import { describe, expect, it } from "vitest";
import { colunasDePesagem, lerCSV, lerDataBR, lerNumeroBR, mapearCabecalho } from "./importacao";

describe("leitura de planilha CSV", () => {
  it("lê CSV do Excel brasileiro (;) com aspas e acentos", () => {
    const t = '﻿Brinco;Lote de compra;Obs\r\n0123;Faz. Boa Vista;"manca; pata"\r\n\r\n0456;Faz. X;\r\n';
    expect(lerCSV(t)).toEqual([
      ["Brinco", "Lote de compra", "Obs"],
      ["0123", "Faz. Boa Vista", "manca; pata"],
      ["0456", "Faz. X", ""],
    ]);
  });
  it("também aceita vírgula como separador", () => {
    expect(lerCSV("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("entende números e datas no formato brasileiro", () => {
    expect(lerNumeroBR("430,5")).toBe(430.5);
    expect(lerNumeroBR("1.234,5")).toBe(1234.5);
    expect(lerNumeroBR("380")).toBe(380);
    expect(lerNumeroBR("")).toBeUndefined();
    expect(lerNumeroBR("abc")).toBeNaN();
    expect(lerDataBR("5/1/2026")).toBe("2026-01-05");
    expect(lerDataBR("2026-01-05")).toBe("2026-01-05");
    expect(lerDataBR("")).toBeUndefined();
    expect(lerDataBR("31-01-2026")).toBeNull();
  });
  it("reconhece o cabeçalho mesmo sem acento ou com outra ordem", () => {
    expect(mapearCabecalho(["Raca", "BRINCO", "Lote", "Peso de entrada", "Data de entrada", "Observação"]))
      .toEqual({ raca: 0, brinco: 1, loteCompra: 2, pesoEntrada: 3, dataEntrada: 4, observacao: 5 });
  });
});

describe("colunas de pesagem", () => {
  it("reconhece datas no cabeçalho e ignora as colunas conhecidas", () => {
    expect(colunasDePesagem(["Brinco", "Data de entrada", "Peso 15/02/2026", "Peso em 2026-03-17", "17/04/2026", "Obs"]))
      .toEqual([{ coluna: 2, data: "2026-02-15" }, { coluna: 3, data: "2026-03-17" }, { coluna: 4, data: "2026-04-17" }]);
  });
});
