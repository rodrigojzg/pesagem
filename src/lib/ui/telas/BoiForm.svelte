<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import { app, voltar, avisar, avisarErro, numero } from "../estado.svelte";
  import {
    atualizarAnimal, cadastrarAnimal, ErroDeRegra, ErroForaDaMargem, historicoDeBrincos, historicoDoAnimal, inativarAnimal,
    listarLotesCompra, obterAnimal, trocarBrinco, type Animal, type LoteCompra, type TrocaBrinco,
  } from "../../db/repositorio";
  import type { Historico } from "../../regras/calculos";
  import { formatarDataBR, formatarNumeroBR } from "../../regras/csv";

  let { id }: { id?: number } = $props();

  const RACAS = ["Nelore", "Angus", "Brangus", "Senepol", "Brahman", "Tabapuã", "Guzerá", "Cruzado", "Mestiço"];

  let lotes = $state<LoteCompra[]>([]);
  let animal = $state<Animal>();
  let historico = $state<Historico>();
  let trocas = $state<TrocaBrinco[]>([]);

  let brinco = $state("");
  let loteCompraId = $state<number>();
  let raca = $state("");
  let pesoEntrada = $state("");
  let dataEntrada = $state("");
  let observacao = $state("");
  let novoBrinco = $state("");
  let trocando = $state(false);
  let alertaMargem = $state("");

  async function carregar() {
    if (!app.ciclo) return;
    lotes = await listarLotesCompra(app.ciclo.id);
    if (id == null) {
      loteCompraId = lotes[0]?.id;
      return;
    }
    animal = await obterAnimal(id);
    if (!animal) return;
    brinco = animal.brinco;
    loteCompraId = animal.loteCompraId;
    raca = animal.raca ?? "";
    pesoEntrada = animal.pesoEntrada != null ? String(animal.pesoEntrada).replace(".", ",") : "";
    dataEntrada = animal.dataEntrada ?? "";
    observacao = animal.observacao ?? "";
    historico = await historicoDoAnimal(id);
    trocas = await historicoDeBrincos(id);
  }
  carregar().catch(avisarErro);

  async function salvar(ev?: SubmitEvent, confirmarMargem = false) {
    ev?.preventDefault();
    alertaMargem = "";
    try {
      const peso = numero(pesoEntrada);
      if (Number.isNaN(peso)) throw new ErroDeRegra("Peso de entrada inválido.");
      if (loteCompraId == null) throw new ErroDeRegra("Escolha o lote de compra.");
      const dados = { loteCompraId, raca, pesoEntrada: peso, dataEntrada, observacao, confirmarMargem };
      if (id == null) {
        await cadastrarAnimal(app.ciclo!.id, { ...dados, brinco });
        avisar("sucesso", `Boi ${brinco.trim()} cadastrado`);
        // prepara o próximo cadastro mantendo lote, raça e entrada
        brinco = "";
        observacao = "";
      } else {
        await atualizarAnimal(id, dados);
        avisar("sucesso", "Dados do boi salvos");
        voltar();
      }
    } catch (e) {
      if (e instanceof ErroForaDaMargem) alertaMargem = e.message;
      else avisarErro(e);
    }
  }

  async function confirmarTroca() {
    if (id == null) return;
    try {
      await trocarBrinco(id, novoBrinco);
      avisar("sucesso", "Brinco trocado", "O brinco antigo ficou no histórico.");
      trocando = false;
      novoBrinco = "";
      await carregar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function inativar() {
    if (id == null || !confirm("Inativar este boi (vendido, morto...)? O histórico será mantido.")) return;
    try {
      await inativarAnimal(id);
      avisar("sucesso", "Boi inativado");
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }
</script>

<div class="tela">
  <Cabecalho titulo={id == null ? "Novo boi" : `Boi ${brinco}`} voltar />

  {#if animal?.status === "inativo"}<p class="painel-alerta">Este boi está inativo.</p>{/if}

  <form class="formulario" onsubmit={salvar}>
    {#if id == null}
      <label class="campo">Brinco *
        <input class="entrada-grande" bind:value={brinco} inputmode="numeric" placeholder="0123" required />
      </label>
    {/if}
    <label class="campo">Lote de compra *
      <select bind:value={loteCompraId} required>
        {#each lotes as l (l.id)}<option value={l.id}>{l.nome}</option>{/each}
      </select>
    </label>
    <label class="campo">Raça
      <input bind:value={raca} list="racas" placeholder="Ex.: Nelore" />
      <datalist id="racas">{#each RACAS as r}<option value={r}></option>{/each}</datalist>
    </label>
    <div class="campos-lado">
      <label class="campo">Peso de entrada (kg)
        <input bind:value={pesoEntrada} inputmode="decimal" placeholder="380" />
      </label>
      <label class="campo">Data de entrada
        <input type="date" bind:value={dataEntrada} />
      </label>
    </div>
    <label class="campo">Observação
      <textarea bind:value={observacao} rows="2" placeholder="Pelagem, marca, saúde..."></textarea>
    </label>
    {#if alertaMargem}
      <div class="painel-alerta">
        <div class="painel-titulo">Peso de entrada fora da margem</div>
        <p>{alertaMargem}</p>
        <div class="linha-botoes">
          <button class="btn btn-contorno" type="button" onclick={() => (alertaMargem = "")}>Corrigir</button>
          <button class="btn" type="button" onclick={() => salvar(undefined, true)}>O peso está certo</button>
        </div>
      </div>
    {:else}
      <button class="btn" type="submit">{id == null ? "Cadastrar e continuar" : "Salvar"}</button>
    {/if}
  </form>

  {#if id != null && animal}
    <section class="secao">
      <h2>Brinco</h2>
      {#if trocando}
        <div class="formulario">
          <label class="campo">Brinco novo
            <input class="entrada-grande" bind:value={novoBrinco} inputmode="numeric" />
          </label>
          <div class="linha-botoes">
            <button class="btn" onclick={confirmarTroca}>Confirmar troca</button>
            <button class="btn btn-contorno" onclick={() => (trocando = false)}>Cancelar</button>
          </div>
        </div>
      {:else}
        <button class="btn btn-contorno" onclick={() => (trocando = true)}>Trocar brinco (perdeu o brinco)</button>
      {/if}
      {#each trocas as t (t.id)}
        <p class="dica">{formatarDataBR(t.data)}: {t.brincoAnterior} → {t.brincoNovo}</p>
      {/each}
    </section>

    {#if historico && historico.pontos.length}
      <section class="secao">
        <h2>Histórico de peso</h2>
        <table class="tabela">
          <thead><tr><th>Data</th><th>Peso</th><th>Dias</th><th>GMD</th></tr></thead>
          <tbody>
            {#each historico.pontos as p}
              <tr>
                <td>{formatarDataBR(p.dataHora)}</td>
                <td>{formatarNumeroBR(p.peso, 1)} kg</td>
                <td>{p.dias ?? "–"}</td>
                <td>{p.gmd != null ? formatarNumeroBR(p.gmd, 2) : "–"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if historico.gmdTotal != null}
          <p class="destaque-numero">GMD no período: {formatarNumeroBR(historico.gmdTotal, 2)} kg/dia
            ({historico.ganhoTotal != null ? formatarNumeroBR(historico.ganhoTotal, 1) : "–"} kg em {historico.diasTotal} dias)</p>
        {/if}
      </section>
    {/if}

    {#if animal.status === "ativo"}
      <button class="btn btn-perigo" onclick={inativar}>Inativar boi</button>
    {/if}
  {/if}
</div>
