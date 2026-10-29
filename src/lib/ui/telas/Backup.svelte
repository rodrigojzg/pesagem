<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { avisar, avisarErro, recarregar } from "../estado.svelte";
  import { gerarBackup, restaurarBackup } from "../../db/repositorio";
  import { compartilharArquivo } from "../../util/compartilhar";

  let inputArquivo = $state<HTMLInputElement>();

  async function exportar() {
    try {
      const b = await gerarBackup();
      await compartilharArquivo(`backup-pesagem-${b.exportadoEm.slice(0, 10)}.json`, JSON.stringify(b), "application/json");
    } catch (e) {
      avisarErro(e);
    }
  }

  async function importar(ev: Event) {
    const arquivo = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    try {
      if (!confirm("Restaurar o backup vai SUBSTITUIR todos os dados deste aparelho. Continuar?")) return;
      const n = await restaurarBackup(JSON.parse(await arquivo.text()));
      await recarregar();
      avisar("sucesso", "Backup restaurado", `${n.animais} bois, ${n.sessoes} sessões, ${n.pesagens} pesagens.`);
    } catch (e) {
      avisarErro(e instanceof SyntaxError ? new Error("O arquivo não é um backup válido.") : e);
    } finally {
      if (inputArquivo) inputArquivo.value = "";
    }
  }
</script>

<div class="tela">
  <Cabecalho titulo="Backup" voltar />
  <div class="card">
    <div class="card-titulo"><Icone nome="info" /> Por que fazer backup?</div>
    <p>Os dados ficam só neste celular. Envie o backup para você mesmo (WhatsApp, e-mail ou Arquivos) depois de cada sessão de pesagem.</p>
  </div>
  <button class="btn" onclick={exportar}><Icone nome="nuvem" /> Exportar backup</button>
  <button class="btn btn-contorno" onclick={() => inputArquivo?.click()}>Importar backup</button>
  <input bind:this={inputArquivo} type="file" accept=".json,application/json" hidden onchange={importar} />
</div>
