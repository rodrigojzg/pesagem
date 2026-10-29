<!-- Ícones simples desenhados em SVG (traço), para não depender de bibliotecas externas. -->
<script lang="ts">
  type Nome =
    | "inicio" | "peso" | "rebanho" | "ajustes" | "seta" | "voltar" | "bluetooth" | "nuvem"
    | "camadas" | "alerta" | "erro" | "ok" | "mais" | "busca" | "planilha" | "info" | "lixo" | "grafico";
  let { nome, tamanho = 26, preenchido = false }: { nome: Nome; tamanho?: number; preenchido?: boolean } = $props();
</script>

<svg
  width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
>
  {#if nome === "inicio"}
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  {:else if nome === "peso"}
    <path d="M9 6a3 3 0 1 1 6 0" />
    <path d="M6.5 8h11l2.5 12.5a1 1 0 0 1-1 1.2H5a1 1 0 0 1-1-1.2z" fill={preenchido ? "currentColor" : "none"} />
    <text x="12" y="18" text-anchor="middle" font-size="7" font-weight="700" font-family="sans-serif"
      stroke="none" fill={preenchido ? "var(--icone-fundo, #fff)" : "currentColor"}>kg</text>
  {:else if nome === "rebanho"}
    <path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M8 3v4M16 3v4M4 11h16" />
    <path d="M8 15h3M8 18h6" />
  {:else if nome === "ajustes"}
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  {:else if nome === "seta"}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if nome === "voltar"}
    <path d="M15 5l-7 7 7 7" />
  {:else if nome === "bluetooth"}
    <path d="M7 7l10 10-5 4V3l5 4L7 17" />
  {:else if nome === "nuvem"}
    <path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" />
  {:else if nome === "camadas"}
    <path d="M12 3 2 8l10 5 10-5z" /><path d="M2 13l10 5 10-5" />
  {:else if nome === "alerta"}
    <path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" />
  {:else if nome === "erro"}
    <circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" />
  {:else if nome === "ok"}
    <circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" />
  {:else if nome === "mais"}
    <path d="M12 5v14M5 12h14" />
  {:else if nome === "busca"}
    <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
  {:else if nome === "planilha"}
    <path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M14 3v5h5" />
  {:else if nome === "info"}
    <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" />
  {:else if nome === "grafico"}
    <path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6M20 16V6" />
  {:else if nome === "lixo"}
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  {/if}
</svg>
