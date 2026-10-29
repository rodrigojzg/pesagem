<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import GraficoLinha from "../graficos/GraficoLinha.svelte";
  import GraficoBarras from "../graficos/GraficoBarras.svelte";
  import { CORES_SERIES } from "../graficos/escala";
  import { app, ir, avisarErro } from "../estado.svelte";
  import {
    indicadoresDoCiclo, listarLotesCompra, racasDoCiclo, type DesempenhoBoi, type Indicadores, type LoteCompra,
  } from "../../db/repositorio";
  import { formatarDataBR, formatarNumeroBR } from "../../regras/csv";

  let ind = $state<Indicadores>();
  let lotes = $state<LoteCompra[]>([]);
  let racas = $state<string[]>([]);
  let filtroLote = $state<number | undefined>(undefined);
  let filtroRaca = $state<string | undefined>(undefined);
  let verTodosRanking = $state(false);

  async function carregar() {
    if (!app.ciclo) return;
    try {
      ind = await indicadoresDoCiclo(app.ciclo.id, { loteCompraId: filtroLote, raca: filtroRaca });
    } catch (e) {
      avisarErro(e);
    }
  }

  async function iniciar() {
    if (!app.ciclo) return;
    lotes = await listarLotesCompra(app.ciclo.id);
    racas = await racasDoCiclo(app.ciclo.id);
    await carregar();
  }
  iniciar().catch(avisarErro);

  const kg = (n: number | null | undefined, casas = 1) => (n == null ? "–" : `${formatarNumeroBR(n, casas)} kg`);
  const gmd = (n: number | null | undefined) => (n == null ? "–" : formatarNumeroBR(n, 2));
  const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const nomeRaca = (r: string) => r || "Não informada";
  const curta = (data: string) => formatarDataBR(data).slice(0, 5);
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

  /** Linhas: geral + os 3 lotes com mais bois (mais que isso fica ilegível). */
  const serieEvolucao = $derived.by(() => {
    if (!ind || ind.evolucao.length < 1) return null;
    const datas = ind.evolucao.map((e) => e.data);
    const series = [{ nome: "Geral", cor: CORES_SERIES[0], valores: ind.evolucao.map((e) => e.pesoMedio) }];
    if (filtroLote == null && ind.evolucaoPorLote.length > 1) {
      const maiores = [...ind.lotes].sort((a, b) => b.bois - a.bois).slice(0, 3).map((l) => l.loteCompra.id);
      ind.evolucaoPorLote
        .filter((g) => maiores.includes(g.loteCompra.id))
        .sort((a, b) => maiores.indexOf(a.loteCompra.id) - maiores.indexOf(b.loteCompra.id))
        .forEach((g, i) => series.push({
          nome: g.loteCompra.nome,
          cor: CORES_SERIES[i + 1],
          valores: datas.map((d) => g.pontos.find((p) => p.data === d)?.pesoMedio ?? null),
        }));
    }
    return { rotulos: datas.map(curta), series };
  });

  const ranking = (lista: DesempenhoBoi[]) => (verTodosRanking ? lista : lista.slice(0, 5));
</script>

<div class="tela">
  <Cabecalho titulo="Resultados" subtitulo={app.ciclo ? app.ciclo.nome : "Indicadores do rebanho"} />

  {#if !app.ciclo}
    <p class="vazio">Crie o lote principal em Ajustes para ver os resultados.</p>
  {:else}
    <div class="filtros">
      <select bind:value={filtroLote} onchange={carregar} aria-label="Lote de compra">
        <option value={undefined}>Todos os lotes</option>
        {#each lotes as l (l.id)}<option value={l.id}>{l.nome}</option>{/each}
      </select>
      <select bind:value={filtroRaca} onchange={carregar} aria-label="Raça">
        <option value={undefined}>Todas as raças</option>
        {#each racas as r}<option value={r}>{nomeRaca(r)}</option>{/each}
      </select>
    </div>

    {#if ind}
      {@const v = ind.visao}
      {#if v.bois === 0}
        <p class="vazio">Nenhum boi com esses filtros.</p>
      {:else}
        <!-- ===== Visão geral ===== -->
        <section class="secao">
          <h2>Visão geral</h2>
          <div class="tiles">
            <div class="tile"><span class="tile-valor">{v.bois}</span><span class="tile-rotulo">bois ativos · {v.boisPesados} já pesados</span></div>
            <div class="tile"><span class="tile-valor">{v.diasCiclo}</span><span class="tile-rotulo">dias de ciclo</span></div>
            <div class="tile"><span class="tile-valor">{kg(v.pesoMedioAtual)}</span><span class="tile-rotulo">peso médio atual</span></div>
            <div class="tile"><span class="tile-valor">{gmd(v.gmdMedio)}</span><span class="tile-rotulo">GMD desde a entrada (kg/dia)</span></div>
            <div class="tile"><span class="tile-valor">{gmd(v.gmdUltimoPeriodo)}</span><span class="tile-rotulo">GMD no último período (kg/dia)</span></div>
            <div class="tile"><span class="tile-valor">{formatarNumeroBR(v.kgProduzidos, 0)} kg</span><span class="tile-rotulo">produzidos · {formatarNumeroBR(v.arrobasProduzidas, 1)} @</span></div>
          </div>
          {#if v.valorProduzido != null && v.valorRebanho != null}
            <div class="tiles">
              <div class="tile"><span class="tile-valor">{reais(v.valorProduzido)}</span><span class="tile-rotulo">valor das @ produzidas</span></div>
              <div class="tile"><span class="tile-valor">{reais(v.valorRebanho)}</span><span class="tile-rotulo">valor estimado do rebanho</span></div>
            </div>
          {/if}
          <p class="dica">Arrobas de carcaça com rendimento de {formatarNumeroBR(v.rendimentoPct, 0)}%.
            {#if v.valorProduzido == null}Informe o preço da @ em Ajustes para ver valores em R$.{/if}</p>
        </section>

        <!-- ===== Evolução ===== -->
        {#if serieEvolucao && ind.evolucao.length >= 1}
          <section class="secao">
            <h2>Evolução do peso médio</h2>
            <GraficoLinha rotulos={serieEvolucao.rotulos} series={serieEvolucao.series} formatar={(n) => `${formatarNumeroBR(n, 0)} kg`}
              titulo="Peso médio por sessão de pesagem" />
          </section>
        {/if}
        {#if ind.evolucao.some((e) => e.gmdMedio != null)}
          <section class="secao">
            <h2>GMD por período</h2>
            <GraficoBarras
              itens={ind.evolucao.filter((e) => e.gmdMedio != null).map((e) => ({ rotulo: curta(e.data), valor: e.gmdMedio!, detalhe: `${e.quantidade} bois` }))}
              formatar={(n) => formatarNumeroBR(n, 2)} titulo="GMD médio desde a pesagem anterior (kg/dia)" />
          </section>
        {/if}

        <!-- ===== Comparações ===== -->
        {#if ind.lotes.length}
          <section class="secao">
            <h2>Lotes de compra</h2>
            <table class="tabela">
              <thead><tr><th>Lote</th><th>Bois</th><th>Entrada</th><th>Atual</th><th>GMD</th></tr></thead>
              <tbody>
                {#each ind.lotes as g (g.loteCompra.id)}
                  <tr>
                    <td>{g.loteCompra.nome}{#if g.custoKgCompra != null}<br /><small class="dica">{reais(g.custoKgCompra)}/kg</small>{/if}</td>
                    <td>{g.bois}</td>
                    <td>{kg(g.pesoMedioEntrada, 0)}</td>
                    <td>{kg(g.pesoMedioAtual, 0)}</td>
                    <td><strong>{gmd(g.gmdMedio)}</strong></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}
        {#if ind.racas.length > 1}
          <section class="secao">
            <h2>Por raça</h2>
            <table class="tabela">
              <thead><tr><th>Raça</th><th>Bois</th><th>Peso atual</th><th>GMD</th></tr></thead>
              <tbody>
                {#each ind.racas as r (r.raca)}
                  <tr><td>{nomeRaca(r.raca)}</td><td>{r.bois}</td><td>{kg(r.pesoMedioAtual, 0)}</td><td><strong>{gmd(r.gmdMedio)}</strong></td></tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}

        <!-- ===== Desempenho individual ===== -->
        {#if ind.distribuicaoGMD.length}
          <section class="secao">
            <h2>Distribuição do GMD</h2>
            <GraficoBarras
              itens={ind.distribuicaoGMD.map((f) => ({ rotulo: formatarNumeroBR(f.inicio, 1), valor: f.quantidade, detalhe: `GMD de ${formatarNumeroBR(f.inicio, 1)} a ${formatarNumeroBR(f.fim, 1)}` }))}
              formatar={(n) => `${Math.round(n)} bois`} titulo="Quantidade de bois por faixa de GMD (kg/dia)" />
          </section>
          <section class="secao">
            <div class="linha-espalhada">
              <h2>Melhores e piores GMD</h2>
              <button class="btn btn-texto btn-pequeno" onclick={() => (verTodosRanking = !verTodosRanking)}>{verTodosRanking ? "Ver 5" : "Ver 10"}</button>
            </div>
            <div class="duas-colunas">
              <div>
                <p class="dica">Melhores</p>
                <div class="lista">
                  {#each ranking(ind.melhores) as d (d.animal.id)}
                    <button class="item" onclick={() => ir({ nome: "boi", id: d.animal.id })}>
                      <span class="item-brinco">{d.animal.brinco}</span>
                      <span class="item-texto"><strong>{gmd(d.gmd)}</strong><small>{kg(d.pesoAtual, 0)}</small></span>
                    </button>
                  {/each}
                </div>
              </div>
              <div>
                <p class="dica">Piores</p>
                <div class="lista">
                  {#each ranking(ind.piores) as d (d.animal.id)}
                    <button class="item" onclick={() => ir({ nome: "boi", id: d.animal.id })}>
                      <span class="item-brinco">{d.animal.brinco}</span>
                      <span class="item-texto"><strong>{gmd(d.gmd)}</strong><small>{kg(d.pesoAtual, 0)}</small></span>
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </section>
        {/if}

        <!-- ===== Abate ===== -->
        <section class="secao">
          <h2>Planejamento de abate</h2>
          {#if ind.abate}
            <div class="tiles">
              <div class="tile"><span class="tile-valor">{ind.abate.jaNoAlvo}</span><span class="tile-rotulo">já com {formatarNumeroBR(ind.abate.alvo, 0)} kg ou mais</span></div>
              <div class="tile"><span class="tile-valor">{ind.abate.semPrevisao}</span><span class="tile-rotulo">sem previsão (sem ganho de peso)</span></div>
            </div>
            {#if ind.abate.porMes.length}
              <GraficoBarras itens={ind.abate.porMes.map((m) => ({ rotulo: nomeMes(m.mes), valor: m.quantidade }))}
                formatar={(n) => `${Math.round(n)} bois`} titulo="Bois que devem atingir o peso-alvo, por mês (com o GMD de cada um)" />
            {/if}
          {:else}
            <div class="card destaque-suave">
              <p>Defina o <strong>peso-alvo de abate</strong> no lote principal para ver quantos bois já estão prontos e a previsão dos demais.</p>
              <button class="btn btn-contorno btn-pequeno" onclick={() => ir({ nome: "ciclo" })}>Definir peso-alvo</button>
            </div>
          {/if}
          {#if ind.distribuicaoPeso.length}
            <GraficoBarras
              itens={ind.distribuicaoPeso.map((f) => ({ rotulo: formatarNumeroBR(f.inicio, 0), valor: f.quantidade, detalhe: `${formatarNumeroBR(f.inicio, 0)} a ${formatarNumeroBR(f.fim, 0)} kg` }))}
              formatar={(n) => `${Math.round(n)} bois`} titulo="Bois por faixa de peso atual (kg)" />
          {/if}
        </section>

        <!-- ===== Qualidade dos dados ===== -->
        <section class="secao">
          <h2>Qualidade dos dados</h2>
          <div class="lista">
            <div class="item item-estatico"><span class="item-icone"><Icone nome="alerta" /></span>
              <span class="item-texto"><strong>{ind.qualidade.comAlerta}</strong><small>pesagens com alerta de GMD</small></span></div>
            <div class="item item-estatico"><span class="item-icone"><Icone nome="info" /></span>
              <span class="item-texto"><strong>{ind.qualidade.pendentes}</strong><small>pesagens pendentes (boi sem brinco)</small></span></div>
            <div class="item item-estatico"><span class="item-icone"><Icone nome="peso" /></span>
              <span class="item-texto"><strong>{ind.qualidade.semPesagemRecente}</strong><small>bois sem pesagem há mais de 45 dias</small></span></div>
            <div class="item item-estatico"><span class="item-icone"><Icone nome="rebanho" /></span>
              <span class="item-texto"><strong>{ind.qualidade.nuncaPesados}</strong><small>bois nunca pesados</small></span></div>
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</div>
