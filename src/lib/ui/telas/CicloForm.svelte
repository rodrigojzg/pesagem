<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import { app, voltar, avisar, avisarErro, numero, recarregar } from "../estado.svelte";
  import { atualizarCiclo, configGMD, criarCiclo, encerrarCiclo, ErroDeRegra, hojeLocal, sugerirMargem } from "../../db/repositorio";
  import {
    CONFIG_PADRAO, faixaParaIntervalo, VARIACAO_PESAGEM_PADRAO, type ModoFaixa, type SistemaCriacao,
  } from "../../regras/calculos";
  import { formatarNumeroBR } from "../../regras/csv";

  let { novo = false }: { novo?: boolean } = $props();

  const criando = novo || !app.ciclo;
  const atual = criando ? undefined : app.ciclo;
  const cfg = atual ? configGMD(atual) : undefined;
  const txt = (n: number | undefined) => (n == null ? "" : String(n).replace(".", ","));
  const padrao = CONFIG_PADRAO[atual?.sistema ?? "confinamento"];

  let nome = $state(atual?.nome ?? "");
  let sistema = $state<SistemaCriacao>(atual?.sistema ?? "confinamento");
  let modo = $state<ModoFaixa>(cfg?.modo ?? "esperado");
  let gmdEsperado = $state(txt(cfg?.gmdEsperado ?? padrao.gmdEsperado));
  let tolerancia = $state(txt(cfg?.toleranciaPct ?? padrao.toleranciaPct));
  let gmdMin = $state(txt(cfg?.gmdMin ?? padrao.gmdMin));
  let gmdMax = $state(txt(cfg?.gmdMax ?? padrao.gmdMax));
  let variacao = $state(txt(cfg?.variacaoPesagemKg ?? VARIACAO_PESAGEM_PADRAO));
  let dataInicio = $state(atual?.dataInicio ?? hojeLocal());
  let pesoMinimo = $state(txt(atual?.pesoMinimo));
  let pesoMaximo = $state(txt(atual?.pesoMaximo));
  let pesoAlvo = $state(txt(atual?.pesoAlvoAbate));
  let precoArroba = $state(txt(atual?.precoArroba));
  let rendimento = $state(txt(atual?.rendimentoCarcacaPct));

  /** Prévia: faixa resultante para 30 e 60 dias entre pesagens. */
  const previa = $derived.by(() => {
    const c = {
      modo, gmdEsperado: numero(gmdEsperado) ?? NaN, toleranciaPct: numero(tolerancia) ?? NaN,
      gmdMin: numero(gmdMin) ?? NaN, gmdMax: numero(gmdMax) ?? NaN, variacaoPesagemKg: numero(variacao) ?? 0,
    };
    const f30 = faixaParaIntervalo(c, 30);
    const f60 = faixaParaIntervalo(c, 60);
    if (![f30.min, f30.max, f60.min, f60.max].every(Number.isFinite)) return null;
    return { f30, f60 };
  });

  function trocarSistema() {
    const p = CONFIG_PADRAO[sistema];
    gmdEsperado = txt(p.gmdEsperado);
    tolerancia = txt(p.toleranciaPct);
    gmdMin = txt(p.gmdMin);
    gmdMax = txt(p.gmdMax);
  }

  async function sugerir() {
    if (!atual) return;
    try {
      const m = await sugerirMargem(atual.id);
      if (!m) {
        avisar("info", "Ainda sem pesos", "Cadastre bois com peso de entrada ou faça uma pesagem para o app sugerir a margem.");
        return;
      }
      pesoMinimo = String(m.min);
      pesoMaximo = String(m.max);
    } catch (e) {
      avisarErro(e);
    }
  }

  function lerOpcional(texto: string, rotulo: string): number | undefined {
    const n = numero(texto);
    if (Number.isNaN(n)) throw new ErroDeRegra(`${rotulo} inválido.`);
    return n;
  }

  function lerObrigatorio(texto: string, rotulo: string): number {
    const n = lerOpcional(texto, rotulo);
    if (n == null) throw new ErroDeRegra(`Preencha ${rotulo.toLowerCase()}.`);
    return n;
  }

  async function salvar(ev: SubmitEvent) {
    ev.preventDefault();
    try {
      const dados = {
        nome, sistema, modoFaixa: modo,
        gmdEsperado: lerObrigatorio(gmdEsperado, "GMD esperado"),
        toleranciaPct: lerObrigatorio(tolerancia, "Tolerância"),
        gmdMin: lerObrigatorio(gmdMin, "GMD mínimo"),
        gmdMax: lerObrigatorio(gmdMax, "GMD máximo"),
        variacaoPesagemKg: lerObrigatorio(variacao, "Variação de pesagem"),
      };
      const metas = {
        pesoMinimo: lerOpcional(pesoMinimo, "Peso mínimo"),
        pesoMaximo: lerOpcional(pesoMaximo, "Peso máximo"),
        pesoAlvoAbate: lerOpcional(pesoAlvo, "Peso-alvo"),
        precoArroba: lerOpcional(precoArroba, "Preço da arroba"),
        rendimentoCarcacaPct: lerOpcional(rendimento, "Rendimento"),
      };
      if (criando) await criarCiclo({ ...dados, ...metas, dataInicio });
      else {
        await atualizarCiclo(atual!.id, {
          ...dados,
          pesoMinimo: metas.pesoMinimo ?? null,
          pesoMaximo: metas.pesoMaximo ?? null,
          pesoAlvoAbate: metas.pesoAlvoAbate ?? null,
          precoArroba: metas.precoArroba ?? null,
          rendimentoCarcacaPct: metas.rendimentoCarcacaPct ?? null,
        });
      }
      await recarregar();
      avisar("sucesso", "Lote principal salvo");
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }

  async function encerrar() {
    if (!atual) return;
    if (!confirm(`Encerrar "${atual.nome}"? Ele vira histórico e você poderá criar um novo lote principal.`)) return;
    try {
      await encerrarCiclo(atual.id);
      await recarregar();
      avisar("sucesso", "Lote principal encerrado");
      voltar();
    } catch (e) {
      avisarErro(e);
    }
  }

  const kgDia = (n: number) => formatarNumeroBR(n, 2);
</script>

<div class="tela">
  <Cabecalho titulo={criando ? "Novo lote principal" : "Lote principal"} voltar />

  <form class="formulario" onsubmit={salvar}>
    <label class="campo">Nome *
      <input bind:value={nome} placeholder="Ex.: Confinamento 2026" required />
    </label>
    <label class="campo">Sistema de criação
      <select bind:value={sistema} onchange={trocarSistema}>
        <option value="confinamento">Confinamento</option>
        <option value="semiconfinamento">Semiconfinamento</option>
        <option value="pasto">Pasto</option>
      </select>
    </label>
    {#if criando}
      <label class="campo">Data de início
        <input type="date" bind:value={dataInicio} />
      </label>
    {/if}

    <fieldset class="grupo formulario">
      <legend>GMD plausível (para os alertas de peso)</legend>
      <div class="segmentado">
        <button type="button" class:ativo={modo === "esperado"} onclick={() => (modo = "esperado")}>Esperado ± %</button>
        <button type="button" class:ativo={modo === "faixa"} onclick={() => (modo = "faixa")}>Mínimo e máximo</button>
      </div>
      {#if modo === "esperado"}
        <div class="campos-lado">
          <label class="campo">GMD esperado (kg/dia)
            <input bind:value={gmdEsperado} inputmode="decimal" />
          </label>
          <label class="campo">Tolerância (%)
            <input bind:value={tolerancia} inputmode="decimal" />
          </label>
        </div>
      {:else}
        <div class="campos-lado">
          <label class="campo">Mínimo (kg/dia)
            <input bind:value={gmdMin} inputmode="decimal" />
          </label>
          <label class="campo">Máximo (kg/dia)
            <input bind:value={gmdMax} inputmode="decimal" />
          </label>
        </div>
      {/if}
      <label class="campo">Variação de pesagem (kg)
        <input bind:value={variacao} inputmode="decimal" />
        <span class="dica">Quanto o peso muda sem ganho real (enchimento do rúmen, horário). Alarga a faixa quando as pesagens são próximas.</span>
      </label>
      {#if previa}
        <div class="destaque-suave card">
          <p><strong>Com 30 dias entre pesagens:</strong> alerta abaixo de {kgDia(previa.f30.min)} ou acima de {kgDia(previa.f30.max)} kg/dia.</p>
          <p><strong>Com 60 dias:</strong> abaixo de {kgDia(previa.f60.min)} ou acima de {kgDia(previa.f60.max)} kg/dia.</p>
        </div>
      {/if}
    </fieldset>

    <fieldset class="grupo formulario">
      <legend>Margem de peso do rebanho (opcional)</legend>
      <p class="dica">Faixa em que o seu gado costuma estar. Pesos fora dela pedem confirmação na pesagem e no cadastro,
        e viram observação na importação. Ajuda a pegar erros como 43 em vez de 430.</p>
      <div class="campos-lado">
        <label class="campo">Peso mínimo (kg)
          <input bind:value={pesoMinimo} inputmode="decimal" placeholder="Ex.: 250" />
        </label>
        <label class="campo">Peso máximo (kg)
          <input bind:value={pesoMaximo} inputmode="decimal" placeholder="Ex.: 650" />
        </label>
      </div>
      {#if !criando}
        <button type="button" class="btn btn-contorno btn-pequeno" onclick={sugerir}>Sugerir pelos pesos já registrados</button>
      {/if}
    </fieldset>

    <fieldset class="grupo formulario">
      <legend>Metas e valores (opcional)</legend>
      <p class="dica">Usados na aba Resultados: projeção de abate e valores em arroba.</p>
      <label class="campo">Peso-alvo de abate (kg)
        <input bind:value={pesoAlvo} inputmode="decimal" placeholder="Ex.: 540" />
      </label>
      <div class="campos-lado">
        <label class="campo">Preço da @ (R$)
          <input bind:value={precoArroba} inputmode="decimal" placeholder="Ex.: 310" />
        </label>
        <label class="campo">Rendimento de carcaça (%)
          <input bind:value={rendimento} inputmode="decimal" placeholder="52" />
        </label>
      </div>
    </fieldset>

    <button class="btn" type="submit">Salvar</button>
  </form>

  {#if !criando}
    <button class="btn btn-perigo" onclick={encerrar}>Encerrar lote principal</button>
  {/if}
</div>
