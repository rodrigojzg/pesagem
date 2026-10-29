<!-- Gráfico de barras verticais de uma série. Toque ou passe o mouse numa barra para ver o valor. -->
<script lang="ts">
  import { caminhoBarra, marcasEixo } from "./escala";

  interface Item { rotulo: string; valor: number; detalhe?: string }
  let {
    itens, cor = "var(--destaque)", formatar = (n: number) => String(Math.round(n)), titulo = "",
  }: { itens: Item[]; cor?: string; formatar?: (n: number) => string; titulo?: string } = $props();

  const L = 640, A = 220, ESQ = 44, DIR = 8, TOPO = 12, BASE = 30, ESPACO = 2;
  let ativo = $state<number | null>(null);

  const minimo = $derived(Math.min(0, ...itens.map((i) => i.valor)));
  const marcas = $derived(marcasEixo(minimo, Math.max(0, ...itens.map((i) => i.valor))));
  const yMin = $derived(marcas[0]);
  const yMax = $derived(marcas[marcas.length - 1]);
  const y = (v: number) => TOPO + ((yMax - v) / (yMax - yMin || 1)) * (A - TOPO - BASE);
  const coluna = $derived((L - ESQ - DIR) / Math.max(1, itens.length));
  const largura = $derived(Math.max(2, Math.min(48, coluna * 0.7) - ESPACO));
  const xBarra = (i: number) => ESQ + i * coluna + (coluna - largura) / 2;
  const passoRotulo = $derived(Math.max(1, Math.ceil(itens.length / 8)));
</script>

<figure class="grafico">
  {#if titulo}<figcaption>{titulo}</figcaption>{/if}
  <div class="grafico-area">
    <svg viewBox="0 0 {L} {A}" role="img" aria-label={titulo} onpointerleave={() => (ativo = null)}>
      {#each marcas as m}
        <line x1={ESQ} x2={L - DIR} y1={y(m)} y2={y(m)} class="grade" />
        <text x={ESQ - 6} y={y(m) + 4} text-anchor="end" class="eixo">{formatar(m)}</text>
      {/each}
      {#each itens as item, i}
        {#if item.valor >= 0}
          <path d={caminhoBarra(xBarra(i), y(item.valor), largura, y(0) - y(item.valor))} fill={cor} opacity={ativo == null || ativo === i ? 1 : 0.5} />
        {:else}
          <rect x={xBarra(i)} y={y(0)} width={largura} height={y(item.valor) - y(0)} fill={cor} opacity={ativo == null || ativo === i ? 1 : 0.5} />
        {/if}
        <!-- área de toque maior que a barra -->
        <rect x={ESQ + i * coluna} y={TOPO} width={coluna} height={A - TOPO - BASE} fill="transparent"
          role="presentation" onpointerenter={() => (ativo = i)} onpointerdown={() => (ativo = i)} />
        {#if i % passoRotulo === 0}
          <text x={ESQ + i * coluna + coluna / 2} y={A - 8} text-anchor="middle" class="eixo">{item.rotulo}</text>
        {/if}
      {/each}
      <line x1={ESQ} x2={L - DIR} y1={y(0)} y2={y(0)} class="base" />
    </svg>
    {#if ativo != null && itens[ativo]}
      <div class="dica-grafico" style="left: clamp(70px, {((ESQ + ativo * coluna + coluna / 2) / L) * 100}%, calc(100% - 70px))">
        <strong>{itens[ativo].rotulo}</strong>
        <span>{formatar(itens[ativo].valor)}{itens[ativo].detalhe ? ` · ${itens[ativo].detalhe}` : ""}</span>
      </div>
    {/if}
  </div>
</figure>
