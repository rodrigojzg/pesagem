<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { app, ir } from "../estado.svelte";
  import { formatarNumeroBR } from "../../regras/csv";

  const VERSAO = "0.4.0";
</script>

<div class="tela">
  <Cabecalho titulo="Configurações" subtitulo="Seus dados" />

  <div class="lista lista-ajustes">
    <button class="item" onclick={() => ir({ nome: "ciclo", novo: !app.ciclo })}>
      <span class="item-icone"><Icone nome="camadas" /></span>
      <span class="item-texto">
        <strong>Lote principal</strong>
        <small>
          {app.ciclo
            ? `${app.ciclo.nome} · ${app.ciclo.modoFaixa === "esperado" ? `GMD esperado ${formatarNumeroBR(app.ciclo.gmdEsperado, 2)} kg/dia ± ${formatarNumeroBR(app.ciclo.toleranciaPct, 0)}%` : `GMD de ${formatarNumeroBR(app.ciclo.gmdMin, 1)} a ${formatarNumeroBR(app.ciclo.gmdMax, 1)} kg/dia`}`
            : "Nenhum lote principal ativo. Toque para criar."}
        </small>
      </span>
      <Icone nome="seta" />
    </button>

    <button class="item" onclick={() => ir({ nome: "dispositivos" })}>
      <span class="item-icone"><Icone nome="bluetooth" /></span>
      <span class="item-texto">
        <strong>Meus dispositivos</strong>
        <small class="link">Balança KM3-N</small>
      </span>
      <Icone nome="seta" />
    </button>

    <button class="item" onclick={() => ir({ nome: "backup" })}>
      <span class="item-icone"><Icone nome="nuvem" /></span>
      <span class="item-texto">
        <strong>Backup</strong>
        <small>Exporte ou importe um backup para o aplicativo.</small>
      </span>
      <Icone nome="seta" />
    </button>
  </div>

  <p class="versao">versão: {VERSAO}</p>
</div>
