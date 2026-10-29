<!-- Tutorial: como adaptar uma planilha do Excel para importar no app. Conteúdo fixo, funciona offline. -->
<script lang="ts">
  import Cabecalho from "../Cabecalho.svelte";
  import Icone from "../Icone.svelte";
  import { avisarErro } from "../estado.svelte";
  import { baixarModeloPlanilha } from "../../util/planilha";
</script>

<div class="tela tutorial">
  <Cabecalho titulo="Como montar a planilha" voltar />

  <div class="card destaque-suave">
    <p><strong>Resumo:</strong> uma linha por boi, os títulos das colunas na primeira linha, tudo na primeira aba.
      As colunas podem estar em qualquer ordem, e colunas com outros títulos são ignoradas.</p>
  </div>

  <section class="secao">
    <h2>1. Comece pelo modelo ou pela sua planilha</h2>
    <p>O jeito mais fácil é baixar o modelo e colar os seus dados nele. Se preferir usar a planilha que você já tem,
      basta <strong>renomear os títulos</strong> das colunas como na tabela abaixo.</p>
    <button class="btn btn-contorno" onclick={() => baixarModeloPlanilha().catch(avisarErro)}><Icone nome="planilha" /> Baixar modelo (.xlsx)</button>
    <div class="tabela-rolavel">
      <table class="tabela">
        <thead><tr><th>Título da coluna</th><th>Precisa?</th><th>Exemplo</th></tr></thead>
        <tbody>
          <tr><td><strong>Brinco</strong></td><td>Sempre</td><td>0123</td></tr>
          <tr><td><strong>Lote de compra</strong></td><td>Para boi novo</td><td>Fazenda Boa Vista</td></tr>
          <tr><td>Raça</td><td>Não</td><td>Nelore</td></tr>
          <tr><td>Peso de entrada</td><td>Não</td><td>380</td></tr>
          <tr><td>Data de entrada</td><td>Se tiver peso de entrada</td><td>10/01/2026</td></tr>
          <tr><td>Observação</td><td>Não</td><td>mancando</td></tr>
          <tr><td><strong>Peso 15/02/2026</strong></td><td>Não (uma coluna por pesagem)</td><td>425</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="secao">
    <h2>2. Uma linha por boi</h2>
    <p>Cada pesagem antiga vira <strong>uma coluna</strong>, com a data no título. Cada data vira uma sessão de pesagem no app.</p>
    <div class="tabela-rolavel">
      <table class="tabela">
        <thead><tr><th>Brinco</th><th>Lote de compra</th><th>Peso 15/02/2026</th><th>Peso 17/03/2026</th></tr></thead>
        <tbody>
          <tr><td>0123</td><td>Faz. Boa Vista</td><td>425</td><td>462</td></tr>
          <tr><td>0456</td><td>Faz. Boa Vista</td><td>404</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="dica">Célula vazia = o boi não foi pesado naquela data.</p>

    <div class="card">
      <div class="card-titulo"><Icone nome="info" /> Sua planilha tem uma linha por pesagem?</div>
      <p>Se ela está assim: <em>Brinco · Data · Peso</em> (o mesmo boi aparece várias vezes), dá para converter no Excel:</p>
      <ol>
        <li>Selecione os dados e vá em <strong>Inserir → Tabela Dinâmica</strong>.</li>
        <li>Arraste <strong>Brinco</strong> para <em>Linhas</em>, <strong>Data</strong> para <em>Colunas</em> e <strong>Peso</strong> para <em>Valores</em>.</li>
        <li>Em <em>Valores</em>, troque "Soma" por <strong>Máximo</strong> (ou Média).</li>
        <li>Copie o resultado, cole em outra aba com <strong>Colar Especial → Valores</strong> e escreva "Peso" antes de cada data no título.</li>
      </ol>
    </div>
  </section>

  <section class="secao">
    <h2>3. Brinco como texto</h2>
    <p>O Excel apaga zeros à esquerda: <strong>0123 vira 123</strong>. Antes de digitar ou colar os brincos,
      selecione a coluna, clique com o botão direito → <strong>Formatar células → Texto</strong>. O modelo já vem assim.</p>
  </section>

  <section class="secao">
    <h2>4. Números e datas</h2>
    <ul>
      <li>Pesos: <strong>430</strong>, <strong>430,5</strong> ou <strong>430.5</strong>. Sem "kg" na célula.</li>
      <li>Datas: <strong>dd/mm/aaaa</strong> (10/01/2026) ou uma célula com formato de data do Excel.</li>
      <li>Para pesagens, a <strong>data precisa estar no título</strong>. Uma coluna chamada só "Peso" é entendida como peso de entrada.</li>
    </ul>
  </section>

  <section class="secao">
    <h2>5. Limpe antes de importar</h2>
    <ul>
      <li>Apague linhas de <strong>total, média</strong> ou subtítulos no meio dos dados.</li>
      <li>Desfaça <strong>células mescladas</strong>.</li>
      <li>Deixe os dados na <strong>primeira aba</strong> e os títulos na <strong>primeira linha</strong> (sem linhas de título acima).</li>
      <li>Um brinco não pode aparecer duas vezes na mesma planilha.</li>
    </ul>
  </section>

  <section class="secao">
    <h2>6. Se aparecer um erro</h2>
    <p>Se houver qualquer erro, <strong>nada é importado</strong>. O app mostra a linha e o motivo:</p>
    <div class="tabela-rolavel">
      <table class="tabela">
        <thead><tr><th>Mensagem</th><th>O que fazer</th></tr></thead>
        <tbody>
          <tr><td>O cabeçalho precisa ter a coluna "Brinco"</td><td>Confira se os títulos estão na 1ª linha e se uma coluna se chama Brinco.</td></tr>
          <tr><td>Brinco repetido na planilha</td><td>Remova a linha duplicada.</td></tr>
          <tr><td>Não está cadastrado: informe o lote de compra</td><td>Boi novo precisa da coluna Lote de compra preenchida.</td></tr>
          <tr><td>Peso inválido / data inválida</td><td>Use só números no peso e datas dd/mm/aaaa.</td></tr>
          <tr><td>Informe a data de entrada junto com o peso</td><td>Preencha a Data de entrada ou apague o Peso de entrada.</td></tr>
        </tbody>
      </table>
    </div>
    <p>Já <strong>observações</strong> (GMD estranho, peso fora da margem, pesagem já existente) não impedem a importação:
      a pesagem entra marcada para você conferir.</p>
  </section>
</div>
