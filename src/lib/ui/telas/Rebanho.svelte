<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, ir, avisar, avisarErro } from "../estado.svelte";
  import {
    importarPlanilhaAnimais, indicadoresDoCiclo, listarLotesCompra, type DesempenhoBoi, type LoteCompra,
  } from "../../db/repositorio";
  import { formatarDataBR, formatarNumeroBR } from "../../regras/csv";
  import { CRITERIOS, ordenarBois, type CriterioOrdem } from "../../regras/ordenacao";
  import { baixarModeloPlanilha, lerPlanilha, TIPOS_ACEITOS } from "../../util/planilha";

  let { abaInicial = "bois" }: { abaInicial?: "bois" | "lotes" } = $props();

  let abaAtual = $state<"bois" | "lotes">(abaInicial);
  let desempenho = $state<DesempenhoBoi[]>([]);
  let lotes = $state<LoteCompra[]>([]);
  let busca = $state("");
  let errosImportacao = $state<{ linha: number; mensagem: string }[]>([]);
  let avisosImportacao = $state<string[]>([]);
  let importando = $state(false);
  let inputArquivo = $state<HTMLInputElement>();

  // ---- ordenação e filtros (a escolha fica salva neste aparelho) ----
  type Preferencias = { criterio: CriterioOrdem; crescente: boolean };
  function lerPreferencias(): Preferencias {
    try {
      const p = JSON.parse(localStorage.getItem("rebanho-ordem") ?? "null");
      if (p && CRITERIOS.some((c) => c.valor === p.criterio)) return { criterio: p.criterio, crescente: !!p.crescente };
    } catch { /* sem armazenamento: usa o padrão */ }
    return { criterio: "brinco", crescente: true };
  }
  const inicial = lerPreferencias();
  let criterio = $state<CriterioOrdem>(inicial.criterio);
  let crescente = $state(inicial.crescente);
  let filtroLote = $state<number | undefined>(undefined);
  let filtroRaca = $state<string | undefined>(undefined);
  let filtroRapido = $state<"" | "nuncaPesados" | "comAlerta">("");

  function salvarPreferencias() {
    try { localStorage.setItem("rebanho-ordem", JSON.stringify({ criterio, crescente })); } catch { /* ignora */ }
  }

  const contagem = $derived(desempenho.reduce((m, d) => m.set(d.animal.loteCompraId, (m.get(d.animal.loteCompraId) ?? 0) + 1), new Map<number, number>()));
  const racas = $derived([...new Set(desempenho.map((d) => d.animal.raca ?? ""))].sort());
  const boisFiltrados = $derived.by(() => {
    const termo = busca.trim().toUpperCase().replace(/\s/g, "");
    const lista = desempenho
      .filter((d) => !termo || d.animal.brinco.includes(termo))
      .filter((d) => filtroLote == null || d.animal.loteCompraId === filtroLote)
      .filter((d) => filtroRaca == null || (d.animal.raca ?? "") === filtroRaca)
      .filter((d) => filtroRapido !== "nuncaPesados" || !d.ultimaPesagem)
      .filter((d) => filtroRapido !== "comAlerta" || d.comAlerta)
      .map((d) => ({
        id: d.animal.id, brinco: d.animal.brinco, pesoAtual: d.pesoAtual, pesoEntrada: d.animal.pesoEntrada,
        gmd: d.gmd, ultimaPesagem: d.ultimaPesagem, diasAteAlvo: d.diasAteAlvo, lote: d.loteCompra?.nome,
        raca: d.animal.raca, d,
      }));
    return ordenarBois(lista, criterio, crescente).map((x) => x.d);
  });

  /** Texto em destaque de cada linha: o valor usado na ordenação. */
  function destaque(d: DesempenhoBoi): string {
    const kg = (n?: number | null) => (n == null ? "–" : `${formatarNumeroBR(n, 1)} kg`);
    switch (criterio) {
      case "pesoEntrada": return kg(d.animal.pesoEntrada);
      case "gmd": return d.gmd == null ? "–" : `${formatarNumeroBR(d.gmd, 2)} kg/dia`;
      case "ultimaPesagem": return d.ultimaPesagem ? formatarDataBR(d.ultimaPesagem) : "nunca pesado";
      case "abate": return d.diasAteAlvo === undefined ? "sem peso-alvo" : d.diasAteAlvo === 0 ? "no peso-alvo"
        : d.diasAteAlvo === null ? "sem previsão" : `${d.diasAteAlvo} dias${d.dataPrevista ? ` · ${formatarDataBR(d.dataPrevista)}` : ""}`;
      default: return kg(d.pesoAtual);
    }
  }

  async function carregar() {
    if (!app.ciclo) return;
    try {
      desempenho = (await indicadoresDoCiclo(app.ciclo.id)).todos;
      lotes = await listarLotesCompra(app.ciclo.id);
    } catch (e) {
      avisarErro(e);
    }
  }

  carregar();

  async function importar(ev: Event) {
    const arquivo = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!arquivo || !app.ciclo) return;
    errosImportacao = [];
    avisosImportacao = [];
    importando = true;
    try {
      const planilha = await lerPlanilha(arquivo);
      const r = await importarPlanilhaAnimais(app.ciclo.id, planilha.linhas);
      if (r.erros.length) {
        errosImportacao = r.erros;
        avisar("erro", "Planilha com problemas", "Nada foi importado. Corrija as linhas indicadas e tente de novo.", 6000);
      } else {
        const partes = [`${r.bois} bois novos`];
        if (r.boisExistentes) partes.push(`${r.boisExistentes} já cadastrados`);
        if (r.pesagens) partes.push(`${r.pesagens} pesagens em ${r.sessoesCriadas.length} sessão(ões) importada(s)`);
        avisosImportacao = [
          ...(r.lotesCriados.length ? [`Lotes de compra criados: ${r.lotesCriados.join(", ")}.`] : []),
          ...(planilha.brincosNumericos
            ? [`${planilha.brincosNumericos} brinco(s) vieram como número. Se algum deveria começar com 0, formate a coluna Brinco como Texto no Excel e importe de novo.`]
            : []),
          ...r.avisos,
        ];
        avisar("sucesso", "Planilha importada", partes.join(" · "), 6000);
        await carregar();
      }
    } catch (e) {
      avisarErro(e);
    } finally {
      importando = false;
      if (inputArquivo) inputArquivo.value = "";
    }
  }
</script>

<div class="tela">
  <Cabecalho titulo="Meu Rebanho" subtitulo={app.ciclo ? `Bois e lotes de compra · ${app.ciclo.nome}` : ""} />

  {#if !app.ciclo}
    <p class="vazio">Crie o lote principal em Ajustes para cadastrar os bois.</p>
  {:else}
    <div class="segmentado" role="tablist">
      <button role="tab" class:ativo={abaAtual === "bois"} aria-selected={abaAtual === "bois"} onclick={() => (abaAtual = "bois")}>
        Bois ({desempenho.length})
      </button>
      <button role="tab" class:ativo={abaAtual === "lotes"} aria-selected={abaAtual === "lotes"} onclick={() => (abaAtual = "lotes")}>
        Lotes de compra ({lotes.length})
      </button>
    </div>

    {#if abaAtual === "bois"}
      <button class="btn" onclick={() => ir({ nome: "boi" })} disabled={lotes.length === 0}>
        <Icone nome="mais" /> Novo boi
      </button>
      {#if lotes.length === 0}
        <p class="dica">Cadastre primeiro um lote de compra (ou importe uma planilha, que cria os lotes sozinha).</p>
      {/if}
      <div class="linha-botoes">
        <button class="btn btn-contorno" disabled={importando} onclick={() => inputArquivo?.click()}>
          <Icone nome="planilha" /> {importando ? "Importando…" : "Importar planilha"}
        </button>
        <button class="btn btn-texto" onclick={() => baixarModeloPlanilha().catch(avisarErro)}>Baixar modelo</button>
      </div>
      <p class="dica">Excel (.xlsx) ou CSV. Uma linha por boi; para importar pesagens antigas, crie colunas como "Peso 15/02/2026".
        <button class="link-botao" onclick={() => ir({ nome: "tutorialPlanilha" })}>Como montar a planilha</button></p>
      <input bind:this={inputArquivo} type="file" accept={TIPOS_ACEITOS} hidden onchange={importar} />

      {#if errosImportacao.length}
        <div class="painel-alerta">
          <strong>Corrija a planilha:</strong>
          <ul>
            {#each errosImportacao as e}<li>{e.linha ? `Linha ${e.linha}: ` : ""}{e.mensagem}</li>{/each}
          </ul>
        </div>
      {/if}
      {#if avisosImportacao.length}
        <div class="painel-alerta">
          <div class="linha-espalhada">
            <strong>Observações da importação</strong>
            <button class="btn-icone" aria-label="Fechar" onclick={() => (avisosImportacao = [])}>✕</button>
          </div>
          <ul>
            {#each avisosImportacao.slice(0, 30) as a}<li>{a}</li>{/each}
          </ul>
          {#if avisosImportacao.length > 30}<p class="dica">… e mais {avisosImportacao.length - 30}.</p>{/if}
        </div>
      {/if}

      <label class="busca">
        <Icone nome="busca" tamanho={22} />
        <input placeholder="Buscar brinco" inputmode="numeric" bind:value={busca} />
      </label>

      <div class="ordenacao">
        <label class="campo-inline">Ordenar por
          <select bind:value={criterio} onchange={salvarPreferencias}>
            {#each CRITERIOS as c}<option value={c.valor}>{c.nome}</option>{/each}
          </select>
        </label>
        <button class="btn btn-contorno btn-pequeno" aria-label="Inverter ordem"
          onclick={() => { crescente = !crescente; salvarPreferencias(); }}>{crescente ? "↑ Crescente" : "↓ Decrescente"}</button>
      </div>
      <div class="filtros">
        <select bind:value={filtroLote} aria-label="Lote de compra">
          <option value={undefined}>Todos os lotes</option>
          {#each lotes as l (l.id)}<option value={l.id}>{l.nome}</option>{/each}
        </select>
        <select bind:value={filtroRaca} aria-label="Raça">
          <option value={undefined}>Todas as raças</option>
          {#each racas as r}<option value={r}>{r || "Não informada"}</option>{/each}
        </select>
      </div>
      <div class="chips">
        <button class="chip" class:chip-ativo={filtroRapido === "nuncaPesados"}
          onclick={() => (filtroRapido = filtroRapido === "nuncaPesados" ? "" : "nuncaPesados")}>Nunca pesados</button>
        <button class="chip" class:chip-ativo={filtroRapido === "comAlerta"}
          onclick={() => (filtroRapido = filtroRapido === "comAlerta" ? "" : "comAlerta")}>Com alerta</button>
      </div>
      <p class="dica">{boisFiltrados.length} de {desempenho.length} bois</p>

      <div class="lista">
        {#each boisFiltrados as d (d.animal.id)}
          <button class="item" onclick={() => ir({ nome: "boi", id: d.animal.id })}>
            <span class="item-brinco">{d.animal.brinco}</span>
            <span class="item-texto">
              <strong>{destaque(d)}</strong>
              <small>{d.animal.raca ?? "Raça não informada"} · {d.loteCompra?.nome ?? ""}</small>
            </span>
            {#if d.comAlerta}<span class="cor-alerta"><Icone nome="alerta" tamanho={20} /></span>{/if}
            <Icone nome="seta" />
          </button>
        {:else}
          <p class="vazio">{desempenho.length ? "Nenhum boi com esses filtros." : "Nenhum boi cadastrado."}</p>
        {/each}
      </div>
    {:else}
      <button class="btn" onclick={() => ir({ nome: "lote" })}><Icone nome="mais" /> Novo lote de compra</button>
      <div class="lista">
        {#each lotes as l (l.id)}
          <button class="item" onclick={() => ir({ nome: "lote", id: l.id })}>
            <span class="item-icone"><Icone nome="camadas" /></span>
            <span class="item-texto">
              <strong>{l.nome}</strong>
              <small>
                {contagem.get(l.id) ?? 0} bois{l.fornecedor ? ` · ${l.fornecedor}` : ""}{l.dataCompra ? ` · ${formatarDataBR(l.dataCompra)}` : ""}
              </small>
            </span>
            <Icone nome="seta" />
          </button>
        {:else}
          <p class="vazio">Nenhum lote de compra cadastrado.</p>
        {/each}
      </div>
    {/if}
  {/if}
</div>
