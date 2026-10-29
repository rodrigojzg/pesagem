<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, aba, ir, avisarErro } from "../estado.svelte";
  import { listarAnimais, listarLotesCompra, listarSessoes, resumoDaSessao, type ResumoSessao } from "../../db/repositorio";
  import { formatarDataBR, formatarNumeroBR } from "../../regras/csv";

  let bois = $state(0);
  let lotes = $state(0);
  let ultima = $state<ResumoSessao | null>(null);

  async function carregar() {
    if (!app.ciclo) return;
    try {
      bois = (await listarAnimais(app.ciclo.id)).length;
      lotes = (await listarLotesCompra(app.ciclo.id)).length;
      const sessoes = await listarSessoes(app.ciclo.id);
      ultima = sessoes.length ? await resumoDaSessao(sessoes[0].id) : null;
    } catch (e) {
      avisarErro(e);
    }
  }
  carregar();

  const kg = (n: number | null) => (n == null ? "–" : `${formatarNumeroBR(n, 1)} kg`);
  const gmd = (n: number | null) => (n == null ? "–" : `${formatarNumeroBR(n, 2)} kg/dia`);
</script>

<div class="tela">
  <Cabecalho titulo="Boas-vindas!" subtitulo="Acompanhe abaixo seus principais indicadores" />

  {#if !app.ciclo}
    <div class="card">
      <div class="card-titulo"><Icone nome="camadas" /> Comece pelo lote principal</div>
      <p>Crie o lote principal do ciclo (ex.: "Confinamento 2026"). Depois cadastre os lotes de compra e os bois.</p>
    </div>
    <button class="btn" onclick={() => ir({ nome: "ciclo", novo: true })}>
      <Icone nome="mais" /> Criar lote principal
    </button>
  {:else}
    <button class="card card-botao" onclick={() => ir({ nome: "ciclo" })}>
      <div class="card-titulo"><Icone nome="camadas" /> {app.ciclo.nome}</div>
      <p>Lote principal · {app.ciclo.sistema} · desde {formatarDataBR(app.ciclo.dataInicio)}</p>
    </button>

    <div class="tiles">
      <button class="tile" onclick={() => aba({ nome: "rebanho", aba: "bois" })}>
        <span class="tile-valor">{bois}</span><span class="tile-rotulo">bois ativos</span>
      </button>
      <button class="tile" onclick={() => aba({ nome: "rebanho", aba: "lotes" })}>
        <span class="tile-valor">{lotes}</span><span class="tile-rotulo">lotes de compra</span>
      </button>
    </div>

    {#if ultima}
      <button class="card card-botao" onclick={() => ultima && ir({ nome: "sessao", id: ultima.sessao.id })}>
        <div class="card-titulo"><Icone nome="peso" /> Última sessão · {formatarDataBR(ultima.sessao.data)}</div>
        <div class="tiles tiles-mini">
          <div><span class="tile-valor">{ultima.geral.pesos.quantidade}</span><span class="tile-rotulo">pesados</span></div>
          <div><span class="tile-valor">{kg(ultima.geral.pesos.media)}</span><span class="tile-rotulo">peso médio</span></div>
          <div><span class="tile-valor">{gmd(ultima.geral.gmdMedio)}</span><span class="tile-rotulo">GMD médio</span></div>
        </div>
      </button>
    {/if}

    {#if bois === 0}
      <div class="card destaque-suave">
        <div class="card-titulo"><Icone nome="info" /> Cadastre os bois antes de pesar</div>
        <p>Na aba Rebanho, cadastre os lotes de compra e os bois, um a um ou importando uma planilha.</p>
      </div>
    {/if}

    <button class="btn" onclick={() => ir({ nome: "pesar" })}>
      <Icone nome="peso" preenchido /> {app.sessaoAberta ? "Continuar pesagem" : "Nova pesagem"}
    </button>
  {/if}
</div>
