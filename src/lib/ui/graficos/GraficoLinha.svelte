<!-- Gráfico de linhas (ex.: peso médio por sessão). Toque ou passe o mouse para ver os valores. -->
<script lang="ts">
  import { marcasEixo } from "./escala";

  interface Serie { nome: string; cor: string; valores: (number | null)[] }
  let {
    rotulos, series, formatar = (n: number) => String(Math.round(n)), titulo = "",
  }: { rotulos: string[]; series: Serie[]; formatar?: (n: number) => string; titulo?: string } = $props();

  const L = 640, A = 240, ESQ = 48, DIR = 16, TOPO = 12, BASE = 30;
  let ativo = $state<number | null>(null);
  let svg = $state<SVGSVGElement>();

  const valores = $derived(series.flatMap((s) => s.valores.filter((v): v is number => v != null)));
  const marcas = $derived(marcasEixo(Math.min(...valores), Math.max(...valores)));
  const yMin = $derived(marcas[0]);
  const yMax = $derived(marcas[marcas.length - 1]);
  const x = (i: number) => ESQ + (rotulos.length <= 1 ? (L - ESQ - DIR) / 2 : (i * (L - ESQ - DIR)) / (rotulos.length - 1));
  const y = (v: number) => TOPO + ((yMax - v) / (yMax - yMin || 1)) * (A - TOPO - BASE);

  function caminho(vals: (number | null)[]): string {
    let d = "";
    let novo = true;
    vals.forEach((v, i) => {
      if (v == null) { novo = true; return; }
      d += `${novo ? "M" : "L"}${x(i)},${y(v)}`;
      novo = false;
    });
    return d;
  }

  /** Mostra só alguns rótulos no eixo X para não sobrepor. */
  const passoRotulo = $derived(Math.max(1, Math.ceil(rotulos.length / 6)));

  function mover(ev: PointerEvent) {
    if (!svg || !rotulos.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * L;
    let melhor = 0;
    rotulos.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i; });
    ativo = melhor;
  }
</script>

<figure class="grafico">
  {#if titulo}<figcaption>{titulo}</figcaption>{/if}
  {#if series.length > 1}
    <div class="legenda">
      {#each series as s}<span><i style="background:{s.cor}"></i>{s.nome}</span>{/each}
    </div>
  {/if}
  <div class="grafico-area">
    <svg bind:this={svg} viewBox="0 0 {L} {A}" role="img" aria-label={titulo}
      onpointermove={mover} onpointerdown={mover} onpointerleave={() => (ativo = null)}>
      {#each marcas as m}
        <line x1={ESQ} x2={L - DIR} y1={y(m)} y2={y(m)} class="grade" />
        <text x={ESQ - 8} y={y(m) + 4} text-anchor="end" class="eixo">{formatar(m)}</text>
      {/each}
      {#each rotulos as r, i}
        {#if i % passoRotulo === 0 || i === rotulos.length - 1}
          <text x={x(i)} y={A - 8} text-anchor="middle" class="eixo">{r}</text>
        {/if}
      {/each}
      {#if ativo != null}
        <line x1={x(ativo)} x2={x(ativo)} y1={TOPO} y2={A - BASE} class="cruz" />
      {/if}
      {#each series as s}
        <path d={caminho(s.valores)} fill="none" stroke={s.cor} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        {#each s.valores as v, i}
          {#if v != null}
            <circle cx={x(i)} cy={y(v)} r={ativo === i ? 6 : 4} fill={s.cor} stroke="var(--fundo)" stroke-width="2" />
          {/if}
        {/each}
      {/each}
    </svg>
    {#if ativo != null}
      <div class="dica-grafico" style="left: clamp(70px, {(x(ativo) / L) * 100}%, calc(100% - 70px))">
        <strong>{rotulos[ativo]}</strong>
        {#each series as s}
          {#if s.valores[ativo] != null}
            <span><i style="background:{s.cor}"></i>{s.nome}: {formatar(s.valores[ativo]!)}</span>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</figure>
