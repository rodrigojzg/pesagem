import { describe, expect, it } from "vitest";
import { formatarDataBR, formatarDataHoraBR, formatarNumeroBR, gerarCSV } from "./csv";

describe("formatarNumeroBR", () => {
  it("usa vírgula decimal e arredonda", () => {
    expect(formatarNumeroBR(430)).toBe("430");
    expect(formatarNumeroBR(1.23456)).toBe("1,235");
    expect(formatarNumeroBR(0.5, 1)).toBe("0,5");
    expect(formatarNumeroBR(-0.0001)).toBe("0");
    expect(formatarNumeroBR(Number.NaN)).toBe("");
  });
});

describe("datas", () => {
  it("formata data simples sem mudar o dia por causa do fuso", () => {
    expect(formatarDataBR("2026-10-16")).toBe("16/10/2026");
  });
  it("formata data e hora no fuso local", () => {
    const iso = new Date(2026, 9, 16, 8, 5).toISOString(); // 16/10/2026 08:05 local
    expect(formatarDataHoraBR(iso)).toBe("16/10/2026 08:05");
  });
});

describe("gerarCSV", () => {
  it("gera CSV para o Excel brasileiro", () => {
    const csv = gerarCSV(["Brinco", "Peso (kg)", "Obs"], [
      ["0123", 430.5, null],
      ["0456", 398, 'disse "manco"; ver'],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Brinco;Peso (kg);Obs",
      "0123;430,5;",
      '0456;398;"disse ""manco""; ver"',
      "",
    ]);
  });
  it("neutraliza textos que o Excel leria como fórmula", () => {
    const csv = gerarCSV(["A"], [["=1+1"]]);
    expect(csv).toContain("'=1+1");
  });
});
