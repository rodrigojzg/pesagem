<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, ir, avisar, avisarErro, numero, recarregar } from "../estado.svelte";
  import {
    abrirSessao, ErroAlertaPeso, ErroDeRegra, ErroPesagemDuplicada, hojeLocal, identificarBrinco, linhasDaSessao,
    registrarPesagem, registrarSemBrinco, resumoDaSessao,
    type AvaliacaoPeso, type Identificacao, type LinhaSessao,
  } from "../../db/repositorio";
  import { formatarDataBR, formatarDataHoraBR, formatarNumeroBR } from "../../regras/csv";

  // ---- nova sessão ----
  let dataSessao = $state(hojeLocal());
  let descricao = $state("");

  // ---- pesagem ----
  let modo = $state<"brinco" | "semBrinco">("brinco");
  let brinco = $state("");
  let peso = $state("");
  let ident = $state<Identificacao | null>(null);
  let alerta = $state<AvaliacaoPeso | null>(null);
  let duplicada = $state("");
  let salvando = $state(false);
  let pesados = $state(0);
  let total = $state(0);
  let pendentes = $state(0);
  let recentes = $state<LinhaSessao[]>([]);
  let campoBrinco = $state<HTMLInputElement>();
  let campoPeso = $state<HTMLInputElement>();

  const NOME_REF = { pesagem: "Última pesagem", entrada: "Entrada", compra: "Média de entrada do lote" } as const;

  async function atualizarProgresso() {
    if (!app.sessaoAberta) return;
    const r = await resumoDaSessao(app.sessaoAberta.id);
    pesados = r.geral.pesos.quantidade;
    total = r.totalAtivos;
    pendentes = r.pendentes;
    recentes = (await linhasDaSessao(app.sessaoAberta.id)).slice(-5).reverse();
  }

  async function iniciarSessao(ev: SubmitEvent) {
    ev.preventDefault();
    try {
      await abrirSessao(app.ciclo!.id, { data: dataSessao, descricao });
      await recarregar();
      await atualizarProgresso();
      await tick();
      campoBrinco?.focus();
    } catch (e) {
      avisarErro(e);
    }
  }

  function limpar() {
    brinco = "";
    peso = "";
    ident = null;
    alerta = null;
    duplicada = "";
    tick().then(() => campoBrinco?.focus());
  }

  async function buscar(ev?: SubmitEvent) {
    ev?.preventDefault();
    if (!app.sessaoAberta) return;
    alerta = null;
    duplicada = "";
    try {
      ident = await identificarBrinco(app.sessaoAberta.id, brinco);
      if (ident.encontrado) {
        await tick();
        campoPeso?.focus();
      }
    } catch (e) {
      avisarErro(e);
    }
  }

  function escolherSugestao(b: string) {
    brinco = b;
    buscar();
  }

  async function salvar(opcoes: { confirmarAlertas?: boolean; substituir?: boolean } = {}) {
    if (!app.sessaoAberta || !ident?.encontrado || salvando) return;
    salvando = true;
    try {
      const p = numero(peso);
      if (p == null || Number.isNaN(p)) throw new ErroDeRegra("Digite o peso.");
      const r = await registrarPesagem({
        sessaoId: app.sessaoAberta.id, animalId: ident.animal.id, peso: p, brincoLido: brinco, ...opcoes,
      });
      const gmd = r.avaliacao.gmd != null ? ` · ${r.avaliacao.gmd >= 0 ? "+" : ""}${formatarNumeroBR(r.avaliacao.gmd, 2)} kg/dia` : "";
      avisar("sucesso", `${ident.animal.brinco} · ${formatarNumeroBR(p, 1)} kg salvo`, r.substituiu ? "Pesagem substituída." + gmd : gmd.slice(3));
      limpar();
      await atualizarProgresso();
    } catch (e) {
      if (e instanceof ErroAlertaPeso) alerta = e.avaliacao;
      else if (e instanceof ErroPesagemDuplicada) duplicada = e.message;
      else avisarErro(e);
    } finally {
      salvando = false;
    }
  }

  async function salvarSemBrinco(ev?: SubmitEvent, confirmarAlertas = false) {
    ev?.preventDefault();
    if (!app.sessaoAberta) return;
    try {
      const p = numero(peso);
      if (p == null || Number.isNaN(p)) throw new ErroDeRegra("Digite o peso.");
      const r = await registrarSemBrinco({ sessaoId: app.sessaoAberta.id, peso: p, confirmarAlertas });
      avisar("sucesso", `Salvo como ${r.idProvisorio} (pendente)`, "Identifique este boi ao final, na tela da sessão.", 6000);
      modo = "brinco";
      limpar();
      await atualizarProgresso();
    } catch (e) {
      if (e instanceof ErroAlertaPeso) alerta = e.avaliacao;
      else avisarErro(e);
    }
  }

  // Mantém a tela acesa durante a pesagem, se o navegador permitir.
  let travaTela: WakeLockSentinel | undefined;
  onMount(async () => {
    try { travaTela = await navigator.wakeLock?.request("screen"); } catch { /* sem suporte */ }
    await atualizarProgresso().catch(avisarErro);
    campoBrinco?.focus();
  });
  onDestroy(() => { travaTela?.release().catch(() => {}); });
</script>

<div class="tela">
  {#if !app.ciclo}
    <Cabecalho titulo="Pesagem" voltar />
    <p class="vazio">Crie o lote principal em Ajustes antes de pesar.</p>
  {:else if !app.sessaoAberta}
    <Cabecalho titulo="Nova pesagem" subtitulo={app.ciclo.nome} voltar />
    <form class="formulario" onsubmit={iniciarSessao}>
      <label class="campo">Data da pesagem
        <input type="date" bind:value={dataSessao} required />
      </label>
      <label class="campo">Descrição (opcional)
        <input bind:value={descricao} placeholder="Ex.: Pesagem de 30 dias" />
      </label>
      <button class="btn" type="submit"><Icone nome="peso" preenchido /> Iniciar pesagem</button>
    </form>
  {:else}
    <Cabecalho titulo="Pesagem" subtitulo={`${formatarDataBR(app.sessaoAberta.data)} · ${app.ciclo.nome}`} voltar />

    <button class="progresso" onclick={() => app.sessaoAberta && ir({ nome: "sessao", id: app.sessaoAberta.id })}>
      <span><strong>{pesados}</strong> de {total} bois pesados{pendentes ? ` · ${pendentes} pendente(s)` : ""}</span>
      <span class="barra"><span style="width: {total ? Math.min(100, (pesados / total) * 100) : 0}%"></span></span>
    </button>

    {#if modo === "brinco"}
      <form class="formulario" onsubmit={buscar}>
        <label class="campo">Brinco
          <div class="entrada-com-botao">
            <input bind:this={campoBrinco} class="entrada-grande" bind:value={brinco} inputmode="numeric"
              autocomplete="off" placeholder="Digite o brinco" oninput={() => { ident = null; alerta = null; duplicada = ""; }} />
            <button class="btn btn-quadrado" type="submit" aria-label="Buscar"><Icone nome="busca" /></button>
          </div>
        </label>
      </form>

      {#if ident && !ident.encontrado}
        <div class="painel-erro">
          <strong>Brinco {ident.brinco} não cadastrado.</strong>
          {#if ident.sugestoes.length}
            <p>Você quis dizer:</p>
            <div class="chips">
              {#each ident.sugestoes as s (s.id)}
                <button class="chip" onclick={() => escolherSugestao(s.brinco)}>{s.brinco}</button>
              {/each}
            </div>
          {:else}
            <p>Confira o número ou cadastre o boi na aba Rebanho.</p>
          {/if}
        </div>
      {/if}

      {#if ident?.encontrado}
        <div class="ficha">
          <div class="ficha-brinco">{ident.animal.brinco}</div>
          <div class="ficha-dados">
            <strong>{ident.animal.raca ?? "Raça não informada"}</strong>
            <span>{ident.loteCompra?.nome ?? ""}</span>
            {#if ident.referencia}
              <span>{NOME_REF[ident.referencia.fonte]}: {formatarNumeroBR(ident.referencia.peso, 1)} kg em {formatarDataBR(ident.referencia.data)}</span>
            {:else}
              <span>Sem peso anterior</span>
            {/if}
          </div>
        </div>
        {#if ident.jaPesado}
          <p class="painel-alerta">Este boi já foi pesado nesta sessão ({formatarNumeroBR(ident.jaPesado.peso, 1)} kg).</p>
        {/if}

        <form class="formulario" onsubmit={(ev) => { ev.preventDefault(); salvar(); }}>
          <label class="campo">Peso (kg)
            <input bind:this={campoPeso} class="entrada-peso" bind:value={peso} inputmode="decimal" autocomplete="off"
              placeholder="0" oninput={() => { alerta = null; duplicada = ""; }} />
          </label>

          {#if alerta}
            <div class="painel-alerta">
              <div class="painel-titulo"><Icone nome="alerta" /> Peso fora do esperado</div>
              {#each alerta.alertas as a}<p>{a.mensagem}</p>{/each}
              {#if alerta.referencia}
                <p class="dica">{NOME_REF[alerta.referencia.fonte]}: {formatarNumeroBR(alerta.referencia.peso, 1)} kg
                  há {alerta.dias} dias.</p>
              {/if}
              <div class="linha-botoes">
                <button class="btn btn-contorno" type="button" onclick={limpar}>Corrigir brinco</button>
                <button class="btn" type="button" onclick={() => salvar({ confirmarAlertas: true })}>O peso está certo</button>
              </div>
            </div>
          {:else if duplicada}
            <div class="painel-alerta">
              <p>{duplicada}</p>
              <div class="linha-botoes">
                <button class="btn btn-contorno" type="button" onclick={limpar}>Cancelar</button>
                <button class="btn" type="button" onclick={() => salvar({ substituir: true })}>Substituir</button>
              </div>
            </div>
          {:else}
            <button class="btn" type="submit" disabled={salvando}>Salvar peso</button>
          {/if}
        </form>
      {/if}

      <button class="btn btn-contorno" onclick={() => { modo = "semBrinco"; limpar(); }}>Boi sem brinco</button>
    {:else}
      <div class="painel-alerta">
        <div class="painel-titulo"><Icone nome="info" /> Boi sem brinco</div>
        <p>O peso fica pendente. No fim da sessão o app sugere qual boi é, entre os que faltam pesar.</p>
      </div>
      <form class="formulario" onsubmit={salvarSemBrinco}>
        <label class="campo">Peso (kg)
          <input class="entrada-peso" bind:value={peso} inputmode="decimal" autocomplete="off" placeholder="0"
            oninput={() => (alerta = null)} />
        </label>
        {#if alerta}
          <div class="painel-alerta">
            <div class="painel-titulo"><Icone nome="alerta" /> Peso fora do esperado</div>
            {#each alerta.alertas as a}<p>{a.mensagem}</p>{/each}
            <div class="linha-botoes">
              <button class="btn btn-contorno" type="button" onclick={() => { peso = ""; alerta = null; }}>Corrigir</button>
              <button class="btn" type="button" onclick={() => salvarSemBrinco(undefined, true)}>O peso está certo</button>
            </div>
          </div>
        {:else}
          <button class="btn" type="submit">Salvar como pendente</button>
        {/if}
        <button class="btn btn-texto" type="button" onclick={() => { modo = "brinco"; limpar(); }}>Voltar</button>
      </form>
    {/if}

    {#if recentes.length}
      <section class="secao">
        <h2>Últimas pesagens</h2>
        <div class="lista">
          {#each recentes as l (l.pesagem.id)}
            <div class="item item-estatico">
              <span class="item-brinco">{l.animal?.brinco ?? l.pesagem.idProvisorio}</span>
              <span class="item-texto">
                <strong>{formatarNumeroBR(l.pesagem.peso, 1)} kg</strong>
                <small>{formatarDataHoraBR(l.pesagem.dataHora).slice(11)}{l.pesagem.gmdPeriodo != null ? ` · ${formatarNumeroBR(l.pesagem.gmdPeriodo, 2)} kg/dia` : ""}{l.pesagem.status === "pendente" ? " · pendente" : ""}</small>
              </span>
              {#if l.pesagem.alertas?.length}<span class="cor-alerta"><Icone nome="alerta" tamanho={22} /></span>{/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
