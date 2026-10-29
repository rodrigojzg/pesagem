<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { ir, voltar, avisar, avisarErro, recarregar } from "../estado.svelte";
  import {
    animaisFaltantes, encerrarSessao, excluirPesagem, excluirSessao, exportarSessaoCSV, linhasDaSessao, resolverPendente,
    resumoDaSessao, resumoExclusaoSessao, sugerirParaPendente,
    type Animal, type LinhaSessao, type ResumoSessao, type SugestaoPendente,
  } from "../../db/repositorio";
  import { formatarDataBR, formatarDataHoraBR, formatarNumeroBR } from "../../regras/csv";
  import { compartilharArquivo } from "../../util/compartilhar";

  let { id }: { id: number } = $props();

  let resumo = $state<ResumoSessao>();
  let linhas = $state<LinhaSessao[]>([]);
  let faltantes = $state<Animal[]>([]);
  let verFaltantes = $state(false);

  // resolução de pendente
  let pendenteAberta = $state<number | null>(null);
  let sugestoes = $state<SugestaoPendente[]>([]);
  let escolhido = $state<number | null>(null);
  let novoBrinco = $state("");

  const aberta = $derived(!!resumo && !resumo.sessao.encerradaEm);
  const pendentes = $derived(linhas.filter((l) => l.pesagem.status === "pendente"));
  const kg = (n: number | null) => (n == null ? "–" : `${formatarNumeroBR(n, 1)} kg`);
  const gmd = (n: number | null) => (n == null ? "–" : formatarNumeroBR(n, 2));

  async function carregar() {
    try {
      resumo = await resumoDaSessao(id);
      linhas = await linhasDaSessao(id);
      faltantes = await animaisFaltantes(id);
    } catch (e) {
      avisarErro(e);
    }
  }
  carregar();

  async function abrirPendente(pesagemId: number) {
    pendenteAberta = pesagemId;
    escolhido = null;
    novoBrinco = "";
    try {
      sugestoes = await sugerirParaPendente(pesagemId);
    } catch (e) {
      avisarErro(e);
    }
  }

  async function confirmarPendente() {
    if (pendenteAberta == null || escolhido == null) return;
    try {
      await resolverPendente(pendenteAberta, escolhido, novoBrinco || undefined);
      avisar("sucesso", "Pesagem identificada");
      pendenteAberta = null;
      await carregar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function exportar() {
    try {
      const csv = await exportarSessaoCSV(id);
      await compartilharArquivo(`pesagem-${resumo?.sessao.data ?? id}.csv`, csv);
    } catch (e) {
      avisarErro(e);
    }
  }

  // ---- apagar sessão ----
  let apagando = $state(false);
  let aApagar = $state<{ pesagens: number; pendentes: number; bois: number }>();
  let confirmacaoData = $state("");
  const dataSessao = $derived(resumo ? formatarDataBR(resumo.sessao.data) : "");

  async function pedirExclusao() {
    try {
      aApagar = await resumoExclusaoSessao(id);
      confirmacaoData = "";
      apagando = true;
    } catch (e) {
      avisarErro(e);
    }
  }

  async function apagarSessao() {
    if (aApagar && aApagar.pesagens > 0 && confirmacaoData.trim() !== dataSessao) return;
    try {
      const r = await excluirSessao(id);
      await recarregar();
      avisar("sucesso", "Sessão apagada", r.boisRecalculados ? `GMD recalculado para ${r.boisRecalculados} boi(s).` : undefined);
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function encerrar() {
    const aviso = pendentes.length ? `\nAinda há ${pendentes.length} pesagem(ns) pendente(s).` : "";
    if (!confirm(`Encerrar a sessão? Depois disso ela não aceita mais pesagens.${aviso}`)) return;
    try {
      await encerrarSessao(id);
      await recarregar();
      avisar("sucesso", "Sessão encerrada");
      await carregar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function excluir(pesagemId: number) {
    if (!confirm("Excluir esta pesagem?")) return;
    try {
      await excluirPesagem(pesagemId);
      await carregar();
    } catch (e) {
      avisarErro(e);
    }
  }
</script>

<div class="tela">
  <Cabecalho titulo={resumo ? `Sessão ${formatarDataBR(resumo.sessao.data)}` : "Sessão"} subtitulo={resumo?.sessao.descricao ?? ""} voltar />

  {#if resumo}
    <div class="tiles">
      <div class="tile"><span class="tile-valor">{resumo.geral.pesos.quantidade}/{resumo.totalAtivos}</span><span class="tile-rotulo">bois pesados</span></div>
      <div class="tile"><span class="tile-valor">{kg(resumo.geral.pesos.media)}</span><span class="tile-rotulo">peso médio</span></div>
      <div class="tile"><span class="tile-valor">{gmd(resumo.geral.gmdMedio)}</span><span class="tile-rotulo">GMD do período (kg/dia)</span></div>
      <div class="tile"><span class="tile-valor">{gmd(resumo.geral.gmdMedioDesdeEntrada)}</span><span class="tile-rotulo">GMD desde a entrada</span></div>
    </div>
    <p class="dica centro">Total {kg(resumo.geral.pesos.total)} · mín {kg(resumo.geral.pesos.minimo)} · máx {kg(resumo.geral.pesos.maximo)}
      {resumo.comAlerta ? ` · ${resumo.comAlerta} com alerta confirmado` : ""}</p>

    {#if aberta}
      <button class="btn" onclick={() => ir({ nome: "pesar" })}><Icone nome="peso" preenchido /> Continuar pesagem</button>
    {/if}

    {#if pendentes.length}
      <section class="secao">
        <h2>Pendentes · bois sem brinco ({pendentes.length})</h2>
        {#each pendentes as l (l.pesagem.id)}
          <div class="card">
            <div class="linha-espalhada">
              <strong>{l.pesagem.idProvisorio} · {kg(l.pesagem.peso)}</strong>
              {#if pendenteAberta !== l.pesagem.id}
                <button class="btn btn-contorno btn-pequeno" onclick={() => abrirPendente(l.pesagem.id)}>Identificar</button>
              {/if}
            </div>
            {#if pendenteAberta === l.pesagem.id}
              <p class="dica">Bois que faltam pesar, do mais provável ao menos provável:</p>
              <div class="lista">
                {#each sugestoes as s (s.animal.id)}
                  <button class="item" class:selecionado={escolhido === s.animal.id} onclick={() => (escolhido = s.animal.id)}>
                    <span class="item-brinco">{s.animal.brinco}</span>
                    <span class="item-texto">
                      <strong>{s.animal.raca ?? ""}</strong>
                      <small>{s.esperado != null ? `esperado ~${Math.round(s.esperado)} kg · diferença ${Math.round(s.diferenca ?? 0)} kg` : "sem peso de referência"}</small>
                    </span>
                  </button>
                {:else}
                  <p class="vazio">Não há bois faltando nesta sessão.</p>
                {/each}
              </div>
              <label class="campo">Brinco novo colocado (opcional)
                <input bind:value={novoBrinco} inputmode="numeric" placeholder="Deixe vazio se manteve o brinco" />
              </label>
              <div class="linha-botoes">
                <button class="btn btn-contorno" onclick={() => (pendenteAberta = null)}>Cancelar</button>
                <button class="btn" disabled={escolhido == null} onclick={confirmarPendente}>Confirmar</button>
              </div>
            {/if}
          </div>
        {/each}
      </section>
    {/if}

    {#if resumo.porLoteCompra.length}
      <section class="secao">
        <h2>Por lote de compra</h2>
        <table class="tabela">
          <thead><tr><th>Lote</th><th>Bois</th><th>Média</th><th>GMD</th></tr></thead>
          <tbody>
            {#each resumo.porLoteCompra as g (g.loteCompra.id)}
              <tr>
                <td>{g.loteCompra.nome}</td>
                <td>{g.resumo.pesos.quantidade}</td>
                <td>{kg(g.resumo.pesos.media)}</td>
                <td>{gmd(g.resumo.gmdMedio)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if faltantes.length}
      <section class="secao">
        <button class="linha-espalhada titulo-secao" onclick={() => (verFaltantes = !verFaltantes)}>
          <span class="h2">Faltam pesar ({faltantes.length})</span>
          <span>{verFaltantes ? "Ocultar" : "Ver"}</span>
        </button>
        {#if verFaltantes}
          <div class="chips">{#each faltantes as a (a.id)}<span class="chip">{a.brinco}</span>{/each}</div>
        {/if}
      </section>
    {/if}

    <section class="secao">
      <h2>Pesagens ({linhas.length})</h2>
      <div class="lista">
        {#each [...linhas].reverse() as l (l.pesagem.id)}
          <div class="item item-estatico">
            <span class="item-brinco">{l.animal?.brinco ?? l.pesagem.idProvisorio}</span>
            <span class="item-texto">
              <strong>{kg(l.pesagem.peso)}{l.pesagem.gmdPeriodo != null ? ` · ${gmd(l.pesagem.gmdPeriodo)} kg/dia` : ""}</strong>
              <small>{l.loteCompra?.nome ?? "pendente"} · {formatarDataHoraBR(l.pesagem.dataHora).slice(11)}</small>
            </span>
            {#if l.pesagem.alertas?.length}<span class="cor-alerta" title="Alerta confirmado"><Icone nome="alerta" tamanho={22} /></span>{/if}
            {#if aberta}
              <button class="btn-icone" aria-label="Excluir" onclick={() => excluir(l.pesagem.id)}><Icone nome="lixo" tamanho={22} /></button>
            {/if}
          </div>
        {:else}
          <p class="vazio">Nenhuma pesagem ainda.</p>
        {/each}
      </div>
    </section>

    <button class="btn btn-contorno" onclick={exportar}><Icone nome="planilha" /> Exportar planilha (CSV)</button>
    {#if aberta}
      <button class="btn btn-perigo" onclick={encerrar}>Encerrar sessão</button>
    {/if}

    {#if !apagando}
      <button class="btn btn-texto texto-perigo" onclick={pedirExclusao}><Icone nome="lixo" /> Apagar sessão</button>
    {:else if aApagar}
      <section class="card">
        <div class="card-titulo"><Icone nome="alerta" /> Apagar a sessão de {dataSessao}</div>
        {#if aApagar.pesagens === 0}
          <p>A sessão não tem pesagens.</p>
        {:else}
          <p>Serão apagadas <strong>{aApagar.pesagens} pesagens</strong>{aApagar.pendentes ? `, incluindo ${aApagar.pendentes} pendente(s)` : ""}.
            Os bois continuam cadastrados, e o GMD das pesagens seguintes de {aApagar.bois} boi(s) será recalculado.</p>
          <p><strong>Não há como desfazer.</strong></p>
          <button class="btn btn-contorno btn-pequeno" onclick={() => ir({ nome: "backup" })}>Fazer backup antes</button>
          <label class="campo">Para confirmar, digite a data da sessão ({dataSessao})
            <input bind:value={confirmacaoData} placeholder={dataSessao} inputmode="numeric" autocomplete="off" />
          </label>
        {/if}
        <div class="linha-botoes">
          <button class="btn btn-contorno" onclick={() => (apagando = false)}>Cancelar</button>
          <button class="btn btn-perigo" onclick={apagarSessao}
            disabled={aApagar.pesagens > 0 && confirmacaoData.trim() !== dataSessao}>Apagar</button>
        </div>
      </section>
    {/if}
  {/if}
</div>
