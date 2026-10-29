// Testes do banco usando um IndexedDB simulado (fake-indexeddb), rodando no computador.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./banco";
import {
  ErroForaDaMargem, excluirSessao, resumoExclusaoSessao, sugerirMargem,
  atualizarCiclo, excluirLoteCompra, indicadoresDoCiclo, listarLotesCompra, listarSessoes, resumoLoteCompra,
  abrirSessao, animaisFaltantes, cadastrarAnimal, cicloAtivo, criarCiclo, criarLoteCompra, encerrarCiclo,
  encerrarSessao, ErroAlertaPeso, ErroPesagemDuplicada, exportarSessaoCSV, gerarBackup, historicoDeBrincos,
  historicoDoAnimal, identificarBrinco, importarAnimaisCSV, inativarAnimal, linhasDaSessao, listarAnimais,
  registrarPesagem, registrarSemBrinco, resolverPendente, restaurarBackup, resumoDaSessao, sugerirParaPendente,
  trocarBrinco,
} from "./repositorio";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Cenário padrão: ciclo de confinamento com 2 lotes de compra e 3 bois. */
async function cenario() {
  const cicloId = await criarCiclo({ nome: "Confinamento 2026", sistema: "confinamento", dataInicio: "2026-01-01" });
  const loteA = await criarLoteCompra(cicloId, {
    nome: "Faz. Boa Vista", dataCompra: "2026-01-05", fornecedor: "João", valorPago: 15600,
  });
  const loteB = await criarLoteCompra(cicloId, { nome: "Leilão Março" });
  const boi1 = await cadastrarAnimal(cicloId, { brinco: "0123", loteCompraId: loteA, raca: "Nelore", pesoEntrada: 400, dataEntrada: "2026-01-10" });
  const boi2 = await cadastrarAnimal(cicloId, { brinco: "0456", loteCompraId: loteA, raca: "Nelore", pesoEntrada: 380, dataEntrada: "2026-01-10" });
  const boi3 = await cadastrarAnimal(cicloId, { brinco: "0789", loteCompraId: loteB, raca: "Angus" });
  return { cicloId, loteA, loteB, boi1, boi2, boi3 };
}

describe("lote principal (ciclo)", () => {
  it("só permite um ciclo ativo e aplica a faixa de GMD padrão do sistema", async () => {
    const id = await criarCiclo({ nome: "Conf. 2026", sistema: "confinamento" });
    expect(await cicloAtivo()).toMatchObject({
      id, modoFaixa: "esperado", gmdEsperado: 1.4, toleranciaPct: 50, gmdMin: -0.5, gmdMax: 2.5, variacaoPesagemKg: 15,
    });
    await expect(criarCiclo({ nome: "Outro", sistema: "pasto" })).rejects.toThrow("Já existe um lote principal ativo");
    await encerrarCiclo(id);
    await expect(criarCiclo({ nome: "Conf. 2027", sistema: "pasto" })).resolves.toBeTypeOf("number");
  });

  it("não encerra o ciclo com sessão aberta", async () => {
    const { cicloId } = await cenario();
    await abrirSessao(cicloId);
    await expect(encerrarCiclo(cicloId)).rejects.toThrow("sessão de pesagem aberta");
  });
});

describe("cadastros antes da pesagem", () => {
  it("impede brinco repetido e lote de compra de outro ciclo", async () => {
    const { cicloId, loteA } = await cenario();
    await expect(cadastrarAnimal(cicloId, { brinco: " 01 23", loteCompraId: loteA })).rejects.toThrow("Já existe um boi ativo");
    await expect(cadastrarAnimal(cicloId, { brinco: "9", loteCompraId: 999 })).rejects.toThrow("Lote de compra não encontrado");
  });

  it("exige data junto com o peso de entrada", async () => {
    const { cicloId, loteA } = await cenario();
    await expect(cadastrarAnimal(cicloId, { brinco: "1", loteCompraId: loteA, pesoEntrada: 300 })).rejects.toThrow("data de entrada");
  });

  it("troca de brinco guarda o histórico e libera o brinco antigo", async () => {
    const { cicloId, loteA, boi1 } = await cenario();
    await trocarBrinco(boi1, "9001");
    expect((await historicoDeBrincos(boi1))[0]).toMatchObject({ brincoAnterior: "0123", brincoNovo: "9001" });
    await expect(cadastrarAnimal(cicloId, { brinco: "0123", loteCompraId: loteA })).resolves.toBeTypeOf("number");
    await expect(trocarBrinco(boi1, "0456")).rejects.toThrow("Já existe um boi ativo");
  });

  it("importa planilha, cria lotes que faltam e não importa nada se houver erro", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "pasto" });
    const ruim = "Brinco;Lote de compra;Peso de entrada;Data de entrada\n1;A;300;01/02/2026\n1;A;;\n2;;;";
    const r1 = await importarAnimaisCSV(cicloId, ruim);
    expect(r1.bois).toBe(0);
    expect(r1.erros.map((e) => e.linha)).toEqual([3, 4]);
    expect(await listarAnimais(cicloId)).toHaveLength(0);

    const bom = "Brinco;Lote de compra;Raça;Peso de entrada;Data de entrada\n1;A;Nelore;300,5;01/02/2026\n2;B;;;";
    const r2 = await importarAnimaisCSV(cicloId, bom);
    expect(r2).toMatchObject({ bois: 2, lotesCriados: ["A", "B"], erros: [] });
    const [a1] = await listarAnimais(cicloId);
    expect(a1).toMatchObject({ brinco: "1", raca: "Nelore", pesoEntrada: 300.5, dataEntrada: "2026-02-01" });
  });
});

describe("pesagem", () => {
  it("não cria boi na pesagem: brinco desconhecido traz sugestões", async () => {
    const { cicloId } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    const r = await identificarBrinco(sessaoId, "0132");
    expect(r.encontrado).toBe(false);
    if (!r.encontrado) expect(r.sugestoes.map((a) => a.brinco)).toEqual(["0123"]);
    expect(await listarAnimais(cicloId)).toHaveLength(3);
  });

  it("mostra a ficha do boi com a referência de peso", async () => {
    const { cicloId } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    const r = await identificarBrinco(sessaoId, " 01 23 ");
    expect(r.encontrado).toBe(true);
    if (r.encontrado) {
      expect(r.animal.raca).toBe("Nelore");
      expect(r.loteCompra?.nome).toBe("Faz. Boa Vista");
      expect(r.referencia).toMatchObject({ fonte: "entrada", peso: 400 });
    }
  });

  it("salva peso normal e calcula o GMD desde a entrada", async () => {
    const { cicloId, boi1 } = await cenario();
    const sessaoId = await abrirSessao(cicloId, { data: "2026-02-09" });
    const r = await registrarPesagem({ sessaoId, animalId: boi1, peso: 430, dataHora: "2026-02-09T12:00:00.000Z" });
    expect(r.avaliacao.dias).toBe(30);
    expect(r.avaliacao.gmd).toBe(1);
    expect(r.avaliacao.alertas).toEqual([]);
  });

  it("peso fora do esperado exige confirmação e fica marcado", async () => {
    const { cicloId, boi1 } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    const dataHora = "2026-02-09T12:00:00.000Z"; // 30 dias após a entrada (400 kg)
    await expect(registrarPesagem({ sessaoId, animalId: boi1, peso: 520, dataHora })).rejects.toBeInstanceOf(ErroAlertaPeso);
    expect(await linhasDaSessao(sessaoId)).toHaveLength(0);
    await registrarPesagem({ sessaoId, animalId: boi1, peso: 520, dataHora, confirmarAlertas: true });
    const [l] = await linhasDaSessao(sessaoId);
    expect(l.pesagem.alertas).toEqual(["gmd-fora-da-faixa"]);
  });

  it("boi sem peso de entrada usa a média de entrada do lote como referência", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "confinamento" });
    const lote = await criarLoteCompra(cicloId, { nome: "L", dataCompra: "2026-01-01" });
    await cadastrarAnimal(cicloId, { brinco: "1", loteCompraId: lote, pesoEntrada: 380, dataEntrada: "2026-01-01" });
    const boi = await cadastrarAnimal(cicloId, { brinco: "2", loteCompraId: lote });
    const sessaoId = await abrirSessao(cicloId);
    // esperado ≈ 380 + 1,4 kg/dia × 31 dias ≈ 423 kg (tolerância de 25%)
    await expect(registrarPesagem({ sessaoId, animalId: boi, peso: 600, dataHora: "2026-02-01T12:00:00.000Z" }))
      .rejects.toBeInstanceOf(ErroAlertaPeso);
    const r = await registrarPesagem({ sessaoId, animalId: boi, peso: 420, dataHora: "2026-02-01T12:00:00.000Z" });
    expect(r.avaliacao.referencia).toMatchObject({ fonte: "compra", peso: 380 });
  });

  it("boi pesado duas vezes: avisa e permite substituir", async () => {
    const { cicloId, boi3 } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    await registrarPesagem({ sessaoId, animalId: boi3, peso: 300 });
    await expect(registrarPesagem({ sessaoId, animalId: boi3, peso: 305 })).rejects.toBeInstanceOf(ErroPesagemDuplicada);
    const r = await registrarPesagem({ sessaoId, animalId: boi3, peso: 305, substituir: true });
    expect(r.substituiu).toBe(true);
    expect(await linhasDaSessao(sessaoId)).toHaveLength(1);
  });

  it("não aceita boi inativo nem sessão encerrada", async () => {
    const { cicloId, boi2, boi3 } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    await inativarAnimal(boi2);
    await expect(registrarPesagem({ sessaoId, animalId: boi2, peso: 400 })).rejects.toThrow("inativo");
    await encerrarSessao(sessaoId);
    await expect(registrarPesagem({ sessaoId, animalId: boi3, peso: 400 })).rejects.toThrow("encerrada");
  });

  it("mediana da sessão detecta GMD fora do padrão depois de 10 bois", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "confinamento", modoFaixa: "faixa", variacaoPesagemKg: 0 });
    const lote = await criarLoteCompra(cicloId, { nome: "L" });
    const ids: number[] = [];
    for (let i = 1; i <= 11; i++) {
      ids.push(await cadastrarAnimal(cicloId, { brinco: String(i), loteCompraId: lote, pesoEntrada: 400, dataEntrada: "2026-01-01" }));
    }
    const sessaoId = await abrirSessao(cicloId);
    const dataHora = "2026-01-31T12:00:00.000Z"; // 30 dias
    for (const id of ids.slice(0, 10)) {
      await registrarPesagem({ sessaoId, animalId: id, peso: 430, dataHora }); // 1,0 kg/dia
    }
    // 2,3 kg/dia está dentro da faixa (até 2,5), mas longe da mediana da sessão (1,0)
    const erro = await registrarPesagem({ sessaoId, animalId: ids[10], peso: 469, dataHora }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAlertaPeso);
    expect((erro as ErroAlertaPeso).avaliacao.alertas[0].tipo).toBe("gmd-distante-da-mediana");
  });
});

describe("boi sem brinco", () => {
  it("fica pendente, sugere o boi mais provável e resolve com brinco novo", async () => {
    const { cicloId, boi1, boi2 } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    const dataHora = "2026-02-09T12:00:00.000Z";
    await registrarPesagem({ sessaoId, animalId: boi1, peso: 430, dataHora });

    // boi 0456 (entrada 380 kg) perdeu o brinco; pesou 412 kg
    const { pesagemId, idProvisorio } = await registrarSemBrinco({ sessaoId, peso: 412, dataHora });
    expect(idProvisorio).toBe("SB-1");
    expect((await resumoDaSessao(sessaoId)).pendentes).toBe(1);
    expect((await animaisFaltantes(sessaoId)).map((a) => a.brinco)).toEqual(["0456", "0789"]);

    const sugestoes = await sugerirParaPendente(pesagemId);
    expect(sugestoes[0].animal.id).toBe(boi2); // 0789 não tem referência e fica por último
    expect(sugestoes[1].esperado).toBeNull();

    await resolverPendente(pesagemId, boi2, "9002");
    const r = await resumoDaSessao(sessaoId);
    expect(r.pendentes).toBe(0);
    expect(r.faltantes).toBe(1);
    expect((await listarAnimais(cicloId)).map((a) => a.brinco)).toContain("9002");
    expect((await historicoDeBrincos(boi2))[0].brincoAnterior).toBe("0456");
  });
});

describe("relatórios por sessão", () => {
  async function duasSessoes() {
    const c = await cenario();
    const s1 = await abrirSessao(c.cicloId, { data: "2026-02-09" });
    await registrarPesagem({ sessaoId: s1, animalId: c.boi1, peso: 430, dataHora: "2026-02-09T12:00:00.000Z" });
    await registrarPesagem({ sessaoId: s1, animalId: c.boi2, peso: 404, dataHora: "2026-02-09T12:00:00.000Z" });
    await encerrarSessao(s1);
    const s2 = await abrirSessao(c.cicloId, { data: "2026-03-11" });
    await registrarPesagem({ sessaoId: s2, animalId: c.boi1, peso: 466, dataHora: "2026-03-11T12:00:00.000Z" });
    await registrarPesagem({ sessaoId: s2, animalId: c.boi3, peso: 350, dataHora: "2026-03-11T12:00:00.000Z" });
    return { ...c, s1, s2 };
  }

  it("resume a sessão no geral e por lote de compra", async () => {
    const { s2 } = await duasSessoes();
    const r = await resumoDaSessao(s2);
    expect(r.geral.pesos).toMatchObject({ quantidade: 2, total: 816, media: 408 });
    expect(r.geral.gmdMedio).toBeCloseTo(1.2); // boi 0123: 430 → 466 em 30 dias; 0789 sem referência
    expect(r.porLoteCompra.map((g) => [g.loteCompra.nome, g.resumo.pesos.quantidade])).toEqual([
      ["Faz. Boa Vista", 1], ["Leilão Março", 1],
    ]);
    expect(r.faltantes).toBe(1);
    expect(r.totalAtivos).toBe(3);
  });

  it("histórico do boi inclui a entrada", async () => {
    const { boi1 } = await duasSessoes();
    const h = await historicoDoAnimal(boi1);
    expect(h.pontos.map((p) => p.peso)).toEqual([400, 430, 466]);
    expect(h.gmdTotal).toBeCloseTo(66 / 60);
  });

  it("exporta CSV com referência, GMD do período e desde a entrada", async () => {
    const { s2 } = await duasSessoes();
    const linhas = (await exportarSessaoCSV(s2)).slice(1).split("\r\n");
    const c = linhas[1].split(";");
    expect([c[0], c[1], c[2], c[3], c[5], c[6], c[8], c[9], c[10]])
      .toEqual(["0123", "Faz. Boa Vista", "Nelore", "466", "Pesagem anterior", "430", "1,2", "400", "1,1"]);
  });

  it("backup exporta e restaura tudo", async () => {
    const { s2 } = await duasSessoes();
    const b = JSON.parse(JSON.stringify(await gerarBackup()));
    await Promise.all(db.tables.map((t) => t.clear()));
    const n = await restaurarBackup(b);
    expect(n).toMatchObject({ ciclos: 1, lotesCompra: 2, animais: 3, sessoes: 2, pesagens: 4 });
    expect((await resumoDaSessao(s2)).geral.pesos.quantidade).toBe(2);
  });
});

describe("lote de compra: valores calculados e exclusão", () => {
  it("calcula peso médio de entrada, valor por cabeça e R$/kg", async () => {
    const { loteA } = await cenario();
    const r = await resumoLoteCompra(loteA);
    expect(r).toMatchObject({ bois: 2, boisComPeso: 2, pesoMedioEntrada: 390, pesoTotalEntrada: 780, valorPorCabeca: 7800, valorPorKg: 20 });
  });

  it("não calcula R$/kg se faltar peso de entrada em algum boi", async () => {
    const { cicloId, loteA } = await cenario();
    await cadastrarAnimal(cicloId, { brinco: "5", loteCompraId: loteA });
    const r = await resumoLoteCompra(loteA);
    expect(r.boisComPeso).toBe(2);
    expect(r.valorPorKg).toBeNull();
  });

  it("apaga lote vazio direto e exige escolha se tiver bois", async () => {
    const { cicloId, loteA } = await cenario();
    const vazio = await criarLoteCompra(cicloId, { nome: "Vazio" });
    await excluirLoteCompra(vazio);
    expect((await listarLotesCompra(cicloId)).map((l) => l.nome)).not.toContain("Vazio");
    await expect(excluirLoteCompra(loteA)).rejects.toThrow("Escolha mover os bois ou apagar tudo");
  });

  it("move os bois para outro lote antes de apagar", async () => {
    const { cicloId, loteA, loteB } = await cenario();
    await excluirLoteCompra(loteA, { moverParaLoteId: loteB });
    expect((await listarAnimais(cicloId)).every((a) => a.loteCompraId === loteB)).toBe(true);
  });

  it("apaga o lote com bois já pesados, junto com pesagens e histórico de brinco", async () => {
    const { cicloId, loteA, boi1 } = await cenario();
    const sessaoId = await abrirSessao(cicloId);
    await registrarPesagem({ sessaoId, animalId: boi1, peso: 430, dataHora: "2026-02-09T12:00:00.000Z" });
    await trocarBrinco(boi1, "7777");
    expect((await resumoLoteCompra(loteA)).pesagens).toBe(1);
    await excluirLoteCompra(loteA, { apagarBois: true });
    expect((await listarAnimais(cicloId)).map((a) => a.brinco)).toEqual(["0789"]);
    expect(await linhasDaSessao(sessaoId)).toHaveLength(0);
    expect(await historicoDeBrincos(boi1)).toHaveLength(0);
  });
});

describe("configuração de GMD do lote principal", () => {
  it("salva os dois modos e valida a faixa", async () => {
    const id = await criarCiclo({ nome: "C", sistema: "pasto" });
    expect(await cicloAtivo()).toMatchObject({ modoFaixa: "esperado", gmdEsperado: 0.5 });
    await atualizarCiclo(id, { modoFaixa: "faixa", gmdMin: 0, gmdMax: 1.2, pesoAlvoAbate: 540, precoArroba: 300 });
    expect(await cicloAtivo()).toMatchObject({ modoFaixa: "faixa", gmdMin: 0, gmdMax: 1.2, pesoAlvoAbate: 540 });
    await expect(atualizarCiclo(id, { gmdMin: 2 })).rejects.toThrow("mínimo deve ser menor");
    await atualizarCiclo(id, { precoArroba: null });
    expect((await cicloAtivo())?.precoArroba).toBeUndefined();
  });

  it("intervalo curto alarga a faixa e evita alerta falso", async () => {
    const { cicloId, boi1 } = await cenario(); // entrada 400 kg em 10/01
    const sessaoId = await abrirSessao(cicloId);
    // 7 dias depois, +20 kg (2,9 kg/dia): fora da faixa base, mas dentro com a correção de 15 kg ÷ 7 dias
    const r = await registrarPesagem({ sessaoId, animalId: boi1, peso: 420, dataHora: "2026-01-17T12:00:00.000Z" });
    expect(r.avaliacao.alertas).toEqual([]);
  });
});

describe("importação com várias pesagens", () => {
  const planilha = [
    "Brinco;Lote de compra;Raça;Peso de entrada;Data de entrada;Peso 09/02/2026;11/03/2026",
    "0123;Faz. A;Nelore;400;10/01/2026;430;466",
    "0456;Faz. A;Nelore;380;10/01/2026;404;",
    "0789;Faz. B;Angus;;;;350",
  ].join("\n");

  it("cria os bois e uma sessão importada por data, com GMD", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "confinamento" });
    const r = await importarAnimaisCSV(cicloId, planilha);
    expect(r).toMatchObject({ bois: 3, pesagens: 4, sessoesCriadas: ["2026-02-09", "2026-03-11"], erros: [] });
    const sessoes = await listarSessoes(cicloId);
    expect(sessoes.every((s) => s.importada && s.encerradaEm)).toBe(true);
    const boi = (await listarAnimais(cicloId))[0];
    const h = await historicoDoAnimal(boi.id);
    expect(h.pontos.map((p) => p.peso)).toEqual([400, 430, 466]);
    const marco = sessoes.find((s) => s.data === "2026-03-11")!;
    const linhas = await linhasDaSessao(marco.id);
    expect(linhas.find((l) => l.animal?.brinco === "0123")?.pesagem.gmdPeriodo).toBeCloseTo(1.2);
  });

  it("acrescenta pesagens a bois já cadastrados sem duplicar", async () => {
    const { cicloId } = await cenario();
    const r = await importarAnimaisCSV(cicloId, "Brinco;Peso 09/02/2026\n0123;430\n0456;404");
    expect(r).toMatchObject({ bois: 0, boisExistentes: 2, pesagens: 2, erros: [] });
    const r2 = await importarAnimaisCSV(cicloId, "Brinco;Peso 09/02/2026\n0123;431");
    expect(r2.pesagens).toBe(0);
    expect(r2.avisos[0]).toContain("mantida a existente");
  });

  it("brinco novo sem lote é erro; GMD estranho vira aviso", async () => {
    const { cicloId } = await cenario();
    const r = await importarAnimaisCSV(cicloId, "Brinco;Peso 09/02/2026\n9999;400");
    expect(r.erros[0].mensagem).toContain("informe o lote de compra");
    const r2 = await importarAnimaisCSV(cicloId, "Brinco;Peso 09/02/2026\n0123;600");
    expect(r2.pesagens).toBe(1);
    expect(r2.avisos[0]).toContain("fora do esperado");
  });
});

describe("indicadores (aba Resultados)", () => {
  it("resume o ciclo, compara lotes e projeta o abate", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "confinamento", dataInicio: "2026-01-01" });
    await atualizarCiclo(cicloId, { pesoAlvoAbate: 502, precoArroba: 300, rendimentoCarcacaPct: 50 });
    await importarAnimaisCSV(cicloId, [
      "Brinco;Lote de compra;Raça;Peso de entrada;Data de entrada;Peso 09/02/2026;11/03/2026",
      "1;A;Nelore;400;10/01/2026;430;466",
      "2;A;Nelore;380;10/01/2026;404;428",
      "3;B;Angus;420;10/01/2026;470;510",
    ].join("\n"));
    const ind = await indicadoresDoCiclo(cicloId);
    expect(ind.visao).toMatchObject({ bois: 3, boisPesados: 3, kgProduzidos: 66 + 48 + 90 });
    expect(ind.visao.pesoMedioAtual).toBeCloseTo((466 + 428 + 510) / 3);
    expect(ind.visao.gmdMedio).toBeCloseTo((1.1 + 0.8 + 1.5) / 3);
    expect(ind.visao.arrobasProduzidas).toBeCloseTo(204 * 0.5 / 15);
    expect(ind.evolucao.map((e) => e.quantidade)).toEqual([3, 3]);
    expect(ind.lotes[0].loteCompra.nome).toBe("B"); // maior GMD primeiro
    expect(ind.melhores[0].animal.brinco).toBe("3");
    expect(ind.piores[0].animal.brinco).toBe("2");
    // alvo 502: boi 3 já chegou; boi 1 (466, 1,1 kg/dia) chega em ~33 dias; boi 2 (428, 0,8) em ~93
    expect(ind.abate).toMatchObject({ alvo: 502, jaNoAlvo: 1, semPrevisao: 0 });
    expect(ind.abate!.porMes.reduce((s, m) => s + m.quantidade, 0)).toBe(2);
    const filtrado = await indicadoresDoCiclo(cicloId, { raca: "Angus" });
    expect(filtrado.visao.bois).toBe(1);
  });
});

describe("apagar sessão", () => {
  it("apaga a sessão e as pesagens, mantém os bois e recalcula o GMD seguinte", async () => {
    const { cicloId, boi1, boi2 } = await cenario(); // boi1: entrada 400 kg em 10/01
    const s1 = await abrirSessao(cicloId, { data: "2026-02-09" });
    await registrarPesagem({ sessaoId: s1, animalId: boi1, peso: 430, dataHora: "2026-02-09T12:00:00.000Z" });
    await registrarSemBrinco({ sessaoId: s1, peso: 400, dataHora: "2026-02-09T12:00:00.000Z" });
    await encerrarSessao(s1);
    const s2 = await abrirSessao(cicloId, { data: "2026-03-11" });
    await registrarPesagem({ sessaoId: s2, animalId: boi1, peso: 466, dataHora: "2026-03-11T12:00:00.000Z" });
    expect((await linhasDaSessao(s2))[0].pesagem).toMatchObject({ refFonte: "pesagem", refPeso: 430 });

    expect(await resumoExclusaoSessao(s1)).toEqual({ pesagens: 2, pendentes: 1, bois: 1 });
    const r = await excluirSessao(s1);
    expect(r).toEqual({ pesagens: 2, boisRecalculados: 1 });
    expect((await listarSessoes(cicloId)).map((s) => s.id)).toEqual([s2]);
    expect(await listarAnimais(cicloId)).toHaveLength(3);
    // agora a referência do boi1 em março é a entrada: 400 → 466 em 60 dias = 1,1
    const [l] = await linhasDaSessao(s2);
    expect(l.pesagem).toMatchObject({ refFonte: "entrada", refPeso: 400 });
    expect(l.pesagem.gmdPeriodo).toBeCloseTo(1.1);
    expect(boi2).toBeTypeOf("number");
  });

  it("apagar a sessão aberta libera abrir outra", async () => {
    const { cicloId } = await cenario();
    const s = await abrirSessao(cicloId);
    await excluirSessao(s);
    await expect(abrirSessao(cicloId)).resolves.toBeTypeOf("number");
  });
});

describe("margem de peso do rebanho", () => {
  async function comMargem() {
    const c = await cenario();
    await atualizarCiclo(c.cicloId, { pesoMinimo: 300, pesoMaximo: 600 });
    return c;
  }

  it("valida e pode ser apagada", async () => {
    const { cicloId } = await cenario();
    await expect(atualizarCiclo(cicloId, { pesoMinimo: 600, pesoMaximo: 300 })).rejects.toThrow("mínimo da margem");
    await atualizarCiclo(cicloId, { pesoMinimo: 300, pesoMaximo: 600 });
    await atualizarCiclo(cicloId, { pesoMinimo: null });
    expect(await cicloAtivo()).toMatchObject({ pesoMaximo: 600 });
    expect((await cicloAtivo())?.pesoMinimo).toBeUndefined();
  });

  it("na pesagem, peso fora da margem pede confirmação mesmo sem referência", async () => {
    const { cicloId, boi3 } = await comMargem(); // boi3 não tem referência
    const sessaoId = await abrirSessao(cicloId);
    const erro = await registrarPesagem({ sessaoId, animalId: boi3, peso: 43 }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroAlertaPeso);
    expect((erro as ErroAlertaPeso).avaliacao.alertas[0].tipo).toBe("peso-fora-da-margem");
    await registrarPesagem({ sessaoId, animalId: boi3, peso: 43, confirmarAlertas: true });
    expect((await linhasDaSessao(sessaoId))[0].pesagem.alertas).toEqual(["peso-fora-da-margem"]);
  });

  it("boi sem brinco também é conferido", async () => {
    const { cicloId } = await comMargem();
    const sessaoId = await abrirSessao(cicloId);
    await expect(registrarSemBrinco({ sessaoId, peso: 900 })).rejects.toBeInstanceOf(ErroAlertaPeso);
    await expect(registrarSemBrinco({ sessaoId, peso: 430 })).resolves.toBeTruthy();
  });

  it("no cadastro, peso de entrada fora da margem pede confirmação", async () => {
    const { cicloId, loteA } = await comMargem();
    await expect(cadastrarAnimal(cicloId, { brinco: "9", loteCompraId: loteA, pesoEntrada: 650, dataEntrada: "2026-01-10" }))
      .rejects.toBeInstanceOf(ErroForaDaMargem);
    await expect(cadastrarAnimal(cicloId, { brinco: "9", loteCompraId: loteA, pesoEntrada: 650, dataEntrada: "2026-01-10", confirmarMargem: true }))
      .resolves.toBeTypeOf("number");
  });

  it("na importação vira observação, sem bloquear", async () => {
    const { cicloId } = await comMargem();
    const r = await importarAnimaisCSV(cicloId, "Brinco;Lote de compra;Peso de entrada;Data de entrada\n77;A;250;01/01/2026");
    expect(r.bois).toBe(1);
    expect(r.avisos[0]).toContain("fora da margem");
  });

  it("sugere margem a partir dos pesos do ciclo", async () => {
    const { cicloId } = await cenario(); // entradas 400 e 380
    expect(await sugerirMargem(cicloId)).toEqual({ min: 340, max: 440 });
  });
});

describe("ordenar rebanho", () => {
  it("usa os dados de desempenho de cada boi", async () => {
    const cicloId = await criarCiclo({ nome: "C", sistema: "confinamento" });
    await importarAnimaisCSV(cicloId, [
      "Brinco;Lote de compra;Peso de entrada;Data de entrada;Peso 09/02/2026",
      "10;A;400;10/01/2026;430",
      "2;B;380;10/01/2026;420",
      "3;A;;;",
    ].join("\n"));
    const { todos } = await indicadoresDoCiclo(cicloId);
    const boi = todos.find((d) => d.animal.brinco === "3")!;
    expect(boi.pesoAtual).toBeNull();
    expect(boi.ultimaPesagem).toBeUndefined();
    expect(todos.find((d) => d.animal.brinco === "2")!.ultimaPesagem).toBeTruthy();
  });
});
