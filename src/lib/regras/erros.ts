/** Erro de regra de negócio: a mensagem pode ser mostrada direto ao usuário. */
export class ErroDeRegra extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeRegra";
  }
}
