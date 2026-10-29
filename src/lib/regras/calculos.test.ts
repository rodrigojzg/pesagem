import { describe, expect, it } from "vitest";
import {
  alertaMargemPeso,
  sugerirMargemDePesos,
  arrobas,
  diasAteAlvo,
  faixaParaIntervalo,
  histograma,
  alertaPesoCompra,
  alertasDeGMD,
  brincosParecidos,
  calcularGMD,
  distanciaBrinco,
  mediana,
  diasEntre,
  historicoComGMD,
  normalizarBrinco,
  resumoPesos,
  validarPeso,
} from "./calculos";

describe("normalizarBrinco", () => {
  it("remove espaços, põe em maiúsculas e mantém zeros à esquerda", () => {
    expect(normalizarBrinco("  01 23 ")).toBe("0123");
    expect(normalizarBrinco("a15")).toBe("A15");
    expect(normalizarBrinco("")).toBe("");
  });
});

describe("validarPeso", () => {
  it("aceita pesos plausíveis", () => {
    expect(() => validarPeso(430)).not.toThrow();
    expect(() => validarPeso(0.5)).not.toThrow();
  });
  it("rejeita zero, negativo, absurdo e NaN", () => {
    expect(() => validarPeso(0)).toThrow("maior que zero");
    expect(() => validarPeso(-10)).toThrow("maior que zero");
    expect(() => validarPeso(5000)).toThrow("limite");
    expect(() => validarPeso(Number.NaN)).toThrow("inválido");
  });
});

describe("resumoPesos", () => {
  it("calcula quantidade, total, média, mínimo e máximo", () => {
    expect(resumoPesos([400, 430, 460])).toEqual({
      quantidade: 3, total: 1290, media: 430, minimo: 400, maximo: 460,
    });
  });
  it("lista vazia não quebra", () => {
    expect(resumoPesos([])).toEqual({ quantidade: 0, total: 0, media: null, minimo: null, maximo: null });
  });
});

describe("GMD", () => {
  it("conta dias inteiros entre datas", () => {
    expect(diasEntre("2026-01-01T10:00:00.000Z", "2026-01-31T09:00:00.000Z")).toBe(30);
  });
  it("calcula ganho médio diário", () => {
    // 400 -> 430 kg em 30 dias = 1 kg/dia
    expect(calcularGMD(400, "2026-01-01T10:00:00.000Z", 430, "2026-01-31T10:00:00.000Z")).toBe(1);
  });
  it("retorna null para pesagens no mesmo dia", () => {
    expect(calcularGMD(400, "2026-01-01T08:00:00.000Z", 402, "2026-01-01T15:00:00.000Z")).toBeNull();
  });
  it("aceita perda de peso (GMD negativo)", () => {
    expect(calcularGMD(400, "2026-01-01T10:00:00.000Z", 390, "2026-01-11T10:00:00.000Z")).toBe(-1);
  });
});

describe("historicoComGMD", () => {
  it("ordena por data e calcula ganho entre pesagens e total", () => {
    const h = historicoComGMD([
      { dataHora: "2026-03-02T10:00:00.000Z", peso: 460 }, // fora de ordem de propósito
      { dataHora: "2026-01-01T10:00:00.000Z", peso: 400 },
      { dataHora: "2026-01-31T10:00:00.000Z", peso: 430 },
    ]);
    expect(h.pontos.map((p) => p.peso)).toEqual([400, 430, 460]);
    expect(h.pontos[0].gmd).toBeNull();
    expect(h.pontos[1]).toMatchObject({ dias: 30, ganho: 30, gmd: 1 });
    expect(h.pontos[2]).toMatchObject({ dias: 30, ganho: 30, gmd: 1 });
    expect(h.ganhoTotal).toBe(60);
    expect(h.diasTotal).toBe(60);
    expect(h.gmdTotal).toBe(1);
  });
  it("com uma pesagem só não há GMD", () => {
    const h = historicoComGMD([{ dataHora: "2026-01-01T10:00:00.000Z", peso: 400 }]);
    expect(h.gmdTotal).toBeNull();
    expect(h.pontos).toHaveLength(1);
  });
});

describe("brincos parecidos (erros de digitação)", () => {
  it("mede a distância entre brincos", () => {
    expect(distanciaBrinco("0123", "0123")).toBe(0);
    expect(distanciaBrinco("0123", "0132")).toBe(1); // dígitos invertidos
    expect(distanciaBrinco("0123", "0128")).toBe(1); // um dígito errado
    expect(distanciaBrinco("0123", "123")).toBe(1); // faltou um dígito
    expect(distanciaBrinco("0123", "3210")).toBeGreaterThan(1);
  });
  it("sugere só os brincos a um erro de distância", () => {
    expect(brincosParecidos("0132", ["0123", "0312", "0132X", "9999", "0130", "0132"]))
      .toEqual(["0123", "0130", "0132X", "0312"]);
  });
});

describe("mediana", () => {
  it("ignora valores extremos", () => {
    expect(mediana([1, 1.1, 1.2, 9])).toBeCloseTo(1.15);
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([])).toBeNull();
  });
});

describe("alertas de peso", () => {
  const config = { modo: "faixa" as const, gmdEsperado: 1, toleranciaPct: 50, gmdMin: -0.5, gmdMax: 2.5, variacaoPesagemKg: 0 };
  it("GMD normal não gera alerta", () => {
    expect(alertasDeGMD(1.1, config, 30, null)).toEqual([]);
  });
  it("GMD fora da faixa gera alerta", () => {
    expect(alertasDeGMD(3.6, config, 30, null)[0].tipo).toBe("gmd-fora-da-faixa");
    expect(alertasDeGMD(-1.7, config, 30, null)[0].tipo).toBe("gmd-fora-da-faixa");
  });
  it("GMD dentro da faixa mas longe da mediana da sessão gera alerta", () => {
    expect(alertasDeGMD(2.4, config, 30, 1.2)[0].tipo).toBe("gmd-distante-da-mediana");
    expect(alertasDeGMD(1.6, config, 30, 1.2)).toEqual([]);
  });
  it("variação de pesagem alarga a tolerância da mediana", () => {
    expect(alertasDeGMD(2.4, { ...config, variacaoPesagemKg: 15 }, 30, 1.2)).toEqual([]);
  });
  it("referência de compra usa tolerância percentual", () => {
    expect(alertaPesoCompra(420, 400)).toEqual([]);
    expect(alertaPesoCompra(520, 400)[0].tipo).toBe("peso-distante-da-compra");
  });
});

describe("faixa de GMD por intervalo", () => {
  const base = { gmdEsperado: 1.2, toleranciaPct: 50, gmdMin: -0.5, gmdMax: 2.5, variacaoPesagemKg: 15 };
  it("modo esperado ± %, com correção pelo intervalo", () => {
    const f = faixaParaIntervalo({ ...base, modo: "esperado" }, 60);
    expect(f.min).toBeCloseTo(0.35);
    expect(f.max).toBeCloseTo(2.05);
    const curta = faixaParaIntervalo({ ...base, modo: "esperado" }, 7);
    expect(curta.max).toBeGreaterThan(3.8);
  });
  it("largura mínima para GMD baixo", () => {
    const f = faixaParaIntervalo({ ...base, modo: "esperado", gmdEsperado: 0.3, variacaoPesagemKg: 0 }, 30);
    expect(f.min).toBeCloseTo(-0.2);
    expect(f.max).toBeCloseTo(0.8);
  });
  it("modo faixa usa mínimo e máximo", () => {
    const f = faixaParaIntervalo({ ...base, modo: "faixa", variacaoPesagemKg: 0 }, 30);
    expect([f.min, f.max]).toEqual([-0.5, 2.5]);
  });
});

describe("abate e histogramas", () => {
  it("projeta dias até o peso-alvo", () => {
    expect(diasAteAlvo(466, 502, 1.1)).toBe(33);
    expect(diasAteAlvo(510, 502, 1.5)).toBe(0);
    expect(diasAteAlvo(400, 502, 0)).toBeNull();
  });
  it("converte peso vivo em arrobas de carcaça", () => {
    expect(arrobas(540, 52)).toBeCloseTo(18.72);
  });
  it("agrupa em faixas", () => {
    expect(histograma([0.5, 0.65, 0.7, 1.1], 0.2)).toEqual([
      { inicio: 0.4, fim: 0.6, quantidade: 1 },
      { inicio: 0.6, fim: 0.8, quantidade: 2 },
      { inicio: 0.8, fim: 1, quantidade: 0 },
      { inicio: 1, fim: 1.2, quantidade: 1 },
    ]);
  });
});

describe("margem de peso", () => {
  it("alerta fora da margem e aceita margem só com um dos limites", () => {
    expect(alertaMargemPeso(430, { min: 300, max: 600 })).toEqual([]);
    expect(alertaMargemPeso(43, { min: 300, max: 600 })[0].tipo).toBe("peso-fora-da-margem");
    expect(alertaMargemPeso(4300, { max: 600 })).toHaveLength(1);
    expect(alertaMargemPeso(4300, {})).toEqual([]);
  });
  it("sugere margem 10% abaixo e acima (considerando o peso-alvo)", () => {
    expect(sugerirMargemDePesos([380, 400, 466])).toEqual({ min: 340, max: 520 });
    expect(sugerirMargemDePesos([380, 400], 540)).toEqual({ min: 340, max: 600 });
    expect(sugerirMargemDePesos([])).toBeNull();
  });
});
