<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, ir, voltar, avisar, avisarErro, numero } from "../estado.svelte";
  import {
    atualizarLoteCompra, criarLoteCompra, ErroDeRegra, excluirLoteCompra, listarLotesCompra, obterLoteCompra,
    resumoLoteCompra, type LoteCompra, type ResumoLoteCompra,
  } from "../../db/repositorio";
  import { formatarNumeroBR } from "../../regras/csv";

  let { id }: { id?: number } = $props();

  let nome = $state("");
  let nomeOriginal = $state("");
  let dataCompra = $state("");
  let fornecedor = $state("");
  let valorPago = $state("");
  let observacao = $state("");
  let resumo = $state<ResumoLoteCompra>();
  let outrosLotes = $state<LoteCompra[]>([]);

  // exclusão
  let excluindo = $state(false);
  let opcaoExclusao = $state<"mover" | "apagar">("mover");
  let destino = $state<number>();
  let confirmacaoNome = $state("");

  const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  async function carregar() {
    if (id == null) return;
    const l = await obterLoteCompra(id);
    if (!l) return;
    nome = l.nome;
    nomeOriginal = l.nome;
    dataCompra = l.dataCompra ?? "";
    fornecedor = l.fornecedor ?? "";
    valorPago = l.valorPago != null ? String(l.valorPago).replace(".", ",") : "";
    observacao = l.observacao ?? "";
    resumo = await resumoLoteCompra(id);
    outrosLotes = (await listarLotesCompra(l.cicloId)).filter((x) => x.id !== id);
    destino = outrosLotes[0]?.id;
    if (!outrosLotes.length) opcaoExclusao = "apagar";
  }
  carregar().catch(avisarErro);

  async function salvar(ev: SubmitEvent) {
    ev.preventDefault();
    try {
      const valor = numero(valorPago);
      if (Number.isNaN(valor)) throw new ErroDeRegra("Valor pago inválido.");
      const dados = { nome, dataCompra, fornecedor, valorPago: valor, observacao };
      if (id == null) await criarLoteCompra(app.ciclo!.id, dados);
      else await atualizarLoteCompra(id, dados);
      avisar("sucesso", "Lote de compra salvo");
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function excluir() {
    if (id == null || !resumo) return;
    try {
      if (resumo.bois === 0) {
        if (!confirm(`Apagar o lote "${nomeOriginal}"?`)) return;
        await excluirLoteCompra(id);
      } else if (opcaoExclusao === "mover") {
        if (destino == null) throw new ErroDeRegra("Escolha o lote que vai receber os bois.");
        await excluirLoteCompra(id, { moverParaLoteId: destino });
      } else {
        if (confirmacaoNome.trim() !== nomeOriginal) throw new ErroDeRegra("Digite o nome do lote exatamente como está para confirmar.");
        await excluirLoteCompra(id, { apagarBois: true });
      }
      avisar("sucesso", "Lote de compra apagado");
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }
</script>

<div class="tela">
  <Cabecalho titulo={id == null ? "Novo lote de compra" : "Lote de compra"} voltar />

  {#if resumo}
    <div class="tiles">
      <div class="tile">
        <span class="tile-valor">{resumo.pesoMedioEntrada != null ? `${formatarNumeroBR(resumo.pesoMedioEntrada, 1)} kg` : "–"}</span>
        <span class="tile-rotulo">peso médio de entrada · {resumo.boisComPeso} de {resumo.bois} bois com peso</span>
      </div>
      <div class="tile">
        <span class="tile-valor">{resumo.bois}</span>
        <span class="tile-rotulo">bois · {formatarNumeroBR(resumo.pesoTotalEntrada, 0)} kg na entrada</span>
      </div>
      <div class="tile">
        <span class="tile-valor">{resumo.valorPorCabeca != null ? reais(resumo.valorPorCabeca) : "–"}</span>
        <span class="tile-rotulo">por cabeça</span>
      </div>
      <div class="tile">
        <span class="tile-valor">{resumo.valorPorKg != null ? reais(resumo.valorPorKg) : "–"}</span>
        <span class="tile-rotulo">por kg de entrada</span>
      </div>
    </div>
    <p class="dica">Valores calculados a partir dos bois cadastrados neste lote.
      {#if resumo.valorPorKg == null && resumo.bois > 0}O R$/kg aparece quando todos os bois tiverem peso de entrada.{/if}</p>
  {/if}

  <form class="formulario" onsubmit={salvar}>
    <label class="campo">Nome do lote *
      <input bind:value={nome} placeholder="Ex.: Fazenda Boa Vista - jan/26" required />
    </label>
    <label class="campo">Data da compra
      <input type="date" bind:value={dataCompra} />
    </label>
    <label class="campo">Fornecedor / origem
      <input bind:value={fornecedor} placeholder="Ex.: João da Silva, Leilão X" />
    </label>
    <label class="campo">Valor pago pelo lote (R$)
      <input bind:value={valorPago} inputmode="decimal" placeholder="150000" />
    </label>
    <label class="campo">Observação
      <textarea bind:value={observacao} rows="2"></textarea>
    </label>
    <button class="btn" type="submit">Salvar</button>
  </form>

  {#if id != null && resumo}
    {#if !excluindo}
      <button class="btn btn-perigo" onclick={() => (excluindo = true)}><Icone nome="lixo" /> Apagar lote de compra</button>
    {:else}
      <section class="card">
        <div class="card-titulo"><Icone nome="alerta" /> Apagar "{nomeOriginal}"</div>
        {#if resumo.bois === 0}
          <p>O lote está vazio.</p>
        {:else}
          <p>Este lote tem <strong>{resumo.bois} bois</strong> e <strong>{resumo.pesagens} pesagens</strong>. O que fazer com eles?</p>
          <div class="segmentado">
            <button class:ativo={opcaoExclusao === "mover"} disabled={!outrosLotes.length} onclick={() => (opcaoExclusao = "mover")}>Mover os bois</button>
            <button class:ativo={opcaoExclusao === "apagar"} onclick={() => (opcaoExclusao = "apagar")}>Apagar tudo</button>
          </div>
          {#if opcaoExclusao === "mover"}
            <label class="campo">Mover os bois para
              <select bind:value={destino}>
                {#each outrosLotes as l (l.id)}<option value={l.id}>{l.nome}</option>{/each}
              </select>
            </label>
          {:else}
            <div class="painel-erro">
              <p>Serão apagados os bois, as pesagens deles e o histórico de brincos. <strong>Não há como desfazer.</strong></p>
              <p>Os resumos das sessões antigas passam a ser calculados sem esses bois.</p>
              <button class="btn btn-contorno btn-pequeno" onclick={() => ir({ nome: "backup" })}>Fazer backup antes</button>
            </div>
            <label class="campo">Para confirmar, digite o nome do lote
              <input bind:value={confirmacaoNome} placeholder={nomeOriginal} autocomplete="off" />
            </label>
          {/if}
        {/if}
        <div class="linha-botoes">
          <button class="btn btn-contorno" onclick={() => (excluindo = false)}>Cancelar</button>
          <button class="btn btn-perigo" onclick={excluir}
            disabled={resumo.bois > 0 && opcaoExclusao === "apagar" && confirmacaoNome.trim() !== nomeOriginal}>Apagar</button>
        </div>
      </section>
    {/if}
  {/if}
</div>
