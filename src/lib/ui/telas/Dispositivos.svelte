<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  const temBluetooth = typeof navigator !== "undefined" && "bluetooth" in navigator;
</script>

<div class="tela">
  <Cabecalho titulo="Meus Dispositivos" voltar />
  <h2>Conectados</h2>
  <p class="vazio-esq">Nenhum dispositivo conectado.</p>
  <div class="card">
    <div class="card-titulo">Balança KM3-N</div>
    <p>A conexão por Bluetooth com a balança será a próxima etapa. Por enquanto, digite o peso mostrado no visor.</p>
    <p class="dica">{temBluetooth ? "Este navegador tem Bluetooth disponível." : "Este navegador não tem Bluetooth. No iPhone, use o Bluefy."}</p>
  </div>
</div>
