/**
 * Envia um arquivo pelo menu de compartilhar do celular (WhatsApp, e-mail, Arquivos...).
 * Se o navegador não suportar, faz o download.
 */
export async function compartilharArquivo(
  nome: string,
  conteudo: BlobPart,
  tipo = "text/csv;charset=utf-8",
): Promise<"compartilhado" | "baixado" | "cancelado"> {
  const arquivo = new File([conteudo], nome, { type: tipo });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return "compartilhado";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelado";
      // outro erro: tenta o download abaixo
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "baixado";
}
