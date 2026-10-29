<!-- Estrutura do app: tela atual, barra de abas inferior, botão flutuante de pesagem e avisos. -->
<script lang="ts">
  import { onMount } from "svelte";
  import Icone from "./lib/ui/Icone.svelte";
  import { app, aba, ir, recarregar, avisarErro } from "./lib/ui/estado.svelte";
  import Inicio from "./lib/ui/telas/Inicio.svelte";
  import Rebanho from "./lib/ui/telas/Rebanho.svelte";
  import BoiForm from "./lib/ui/telas/BoiForm.svelte";
  import LoteForm from "./lib/ui/telas/LoteForm.svelte";
  import Sessoes from "./lib/ui/telas/Sessoes.svelte";
  import SessaoDetalhe from "./lib/ui/telas/SessaoDetalhe.svelte";
  import Pesar from "./lib/ui/telas/Pesar.svelte";
  import Ajustes from "./lib/ui/telas/Ajustes.svelte";
  import Resultados from "./lib/ui/telas/Resultados.svelte";
  import CicloForm from "./lib/ui/telas/CicloForm.svelte";
  import Backup from "./lib/ui/telas/Backup.svelte";
  import Dispositivos from "./lib/ui/telas/Dispositivos.svelte";
  import TutorialPlanilha from "./lib/ui/telas/TutorialPlanilha.svelte";

  const t = $derived(app.tela);
  const abaAtiva = $derived(
    t.nome === "inicio" ? "inicio"
    : ["rebanho", "boi", "lote", "tutorialPlanilha"].includes(t.nome) ? "rebanho"
    : ["sessoes", "sessao"].includes(t.nome) ? "sessoes"
    : t.nome === "resultados" ? "resultados"
    : ["ajustes", "ciclo", "backup", "dispositivos"].includes(t.nome) ? "ajustes"
    : "",
  );

  onMount(() => {
    recarregar().catch(avisarErro);
    // Avisa antes de fechar/recarregar a página durante uma sessão aberta.
    const aoSair = (e: BeforeUnloadEvent) => {
      if (app.sessaoAberta) e.preventDefault();
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  });
</script>

<main>
  {#if !app.carregado}
    <div class="tela"><p class="vazio">Carregando…</p></div>
  {:else}
    <!-- {#key} recria a tela ao navegar, para ela recarregar seus dados -->
    {#key t}
      {#if t.nome === "inicio"}<Inicio />
      {:else if t.nome === "rebanho"}<Rebanho abaInicial={t.aba} />
      {:else if t.nome === "boi"}<BoiForm id={t.id} />
      {:else if t.nome === "lote"}<LoteForm id={t.id} />
      {:else if t.nome === "sessoes"}<Sessoes />
      {:else if t.nome === "sessao"}<SessaoDetalhe id={t.id} />
      {:else if t.nome === "pesar"}<Pesar />
      {:else if t.nome === "resultados"}<Resultados />
      {:else if t.nome === "ajustes"}<Ajustes />
      {:else if t.nome === "ciclo"}<CicloForm novo={t.novo} />
      {:else if t.nome === "backup"}<Backup />
      {:else if t.nome === "dispositivos"}<Dispositivos />
      {:else if t.nome === "tutorialPlanilha"}<TutorialPlanilha />
      {/if}
    {/key}
  {/if}
</main>

{#if app.aviso}
  <div class="aviso aviso-{app.aviso.tipo}" role="status">
    <Icone nome={app.aviso.tipo === "erro" ? "erro" : app.aviso.tipo === "sucesso" ? "ok" : "info"} />
    <div>
      <strong>{app.aviso.titulo}</strong>
      {#if app.aviso.texto}<p>{app.aviso.texto}</p>{/if}
    </div>
  </div>
{/if}

{#if app.tela.nome !== "pesar" && app.ciclo}
  <button class="fab" onclick={() => ir({ nome: "pesar" })} aria-label="Pesar">
    <Icone nome="peso" tamanho={34} preenchido />
  </button>
{/if}

<nav class="abas">
  <button class:ativa={abaAtiva === "inicio"} onclick={() => aba({ nome: "inicio" })}>
    <Icone nome="inicio" tamanho={30} /><span>Início</span>
  </button>
  <button class:ativa={abaAtiva === "rebanho"} onclick={() => aba({ nome: "rebanho" })}>
    <Icone nome="rebanho" tamanho={30} /><span>Rebanho</span>
  </button>
  <button class:ativa={abaAtiva === "sessoes"} onclick={() => aba({ nome: "sessoes" })}>
    <Icone nome="peso" tamanho={30} preenchido={abaAtiva === "sessoes"} /><span>Sessões</span>
  </button>
  <button class:ativa={abaAtiva === "resultados"} onclick={() => aba({ nome: "resultados" })}>
    <Icone nome="grafico" tamanho={30} /><span>Resultados</span>
  </button>
  <button class:ativa={abaAtiva === "ajustes"} onclick={() => aba({ nome: "ajustes" })}>
    <Icone nome="ajustes" tamanho={30} /><span>Ajustes</span>
  </button>
</nav>
