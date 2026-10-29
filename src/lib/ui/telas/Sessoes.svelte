<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, ir, avisarErro } from "../estado.svelte";
  import { listarSessoes, resumoDaSessao, type ResumoSessao } from "../../db/repositorio";
  import { formatarDataBR, formatarNumeroBR } from "../../regras/csv";

  let resumos = $state<ResumoSessao[]>([]);
  let carregando = $state(true);

  async function carregar() {
    try {
      if (app.ciclo) {
        const sessoes = await listarSessoes(app.ciclo.id);
        resumos = await Promise.all(sessoes.map((s) => resumoDaSessao(s.id)));
      }
    } catch (e) {
      avisarErro(e);
    } finally {
      carregando = false;
    }
  }
  carregar();
</script>

<div class="tela">
  <Cabecalho titulo="Minhas Sessões" subtitulo="Acesse seu histórico de sessões de pesagem" />

  {#if !carregando && resumos.length === 0}
    <div class="estado-vazio">
      <span class="circulo"></span>
      <p>Nenhuma sessão no histórico.</p>
    </div>
  {/if}

  <div class="lista">
    {#each resumos as r (r.sessao.id)}
      <button class="item" onclick={() => ir({ nome: "sessao", id: r.sessao.id })}>
        <span class="item-icone"><Icone nome="peso" /></span>
        <span class="item-texto">
          <strong>{formatarDataBR(r.sessao.data)}{r.sessao.descricao ? ` · ${r.sessao.descricao}` : ""}</strong>
          <small>
            {r.geral.pesos.quantidade} de {r.totalAtivos} pesados
            {r.geral.pesos.media != null ? ` · média ${formatarNumeroBR(r.geral.pesos.media, 1)} kg` : ""}
            {r.geral.gmdMedio != null ? ` · GMD ${formatarNumeroBR(r.geral.gmdMedio, 2)}` : ""}
          </small>
        </span>
        {#if !r.sessao.encerradaEm}<span class="etiqueta">Aberta</span>{:else if r.sessao.importada}<span class="etiqueta etiqueta-neutra">Importada</span>{/if}
        <Icone nome="seta" />
      </button>
    {/each}
  </div>
</div>
