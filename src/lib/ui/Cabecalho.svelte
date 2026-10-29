<!-- Título da tela. Com `voltar`, mostra a seta e centraliza o título (como nas telas internas). -->
<script lang="ts">
  import Icone from "./Icone.svelte";
  import { voltar as voltarTela } from "./estado.svelte";
  let { titulo, subtitulo = "", voltar = false }: { titulo: string; subtitulo?: string; voltar?: boolean } = $props();
</script>

{#if voltar}
  <header class="cab-interno">
    <button class="btn-icone" onclick={voltarTela} aria-label="Voltar"><Icone nome="voltar" tamanho={30} /></button>
    <h1>{titulo}</h1>
    <span class="espaco"></span>
  </header>
  {#if subtitulo}<p class="subtitulo centro">{subtitulo}</p>{/if}
{:else}
  <header class="cab">
    <h1>{titulo}</h1>
    {#if subtitulo}<p class="subtitulo">{subtitulo}</p>{/if}
  </header>
{/if}
