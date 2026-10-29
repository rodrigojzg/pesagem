// Utilidades para os gráficos em SVG.

/** Cores das séries (ordem fixa; a cor acompanha a série, nunca a posição no ranking). */
export const CORES_SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

/** Marcas "redondas" para o eixo: ex. 380–520 → [375, 400, ..., 525]. */
export function marcasEixo(min: number, max: number, quantidade = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const bruto = (max - min) / quantidade;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? 10 * mag;
  const inicio = Math.floor(min / passo) * passo;
  const marcas: number[] = [];
  for (let v = inicio; v <= max + passo * 0.999; v += passo) marcas.push(Math.round(v * 1e6) / 1e6);
  return marcas;
}

/** Caminho SVG de uma barra com os cantos de cima arredondados (raio 4) e a base reta. */
export function caminhoBarra(x: number, y: number, largura: number, altura: number, raio = 4): string {
  if (altura <= 0) return "";
  const r = Math.min(raio, largura / 2, altura);
  return `M${x},${y + altura}V${y + r}Q${x},${y} ${x + r},${y}H${x + largura - r}Q${x + largura},${y} ${x + largura},${y + r}V${y + altura}Z`;
}
