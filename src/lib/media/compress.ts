import { LIMIT_FOR_KIND, resolveMediaKind } from "@/lib/whatsapp/media";

/**
 * Reduz foto grande até caber no limite da Meta.
 *
 * O limite de 5 MB para imagem é da Cloud API — não dá para aumentar. Mas foto
 * de celular moderno passa disso com folga, e recusar o envio por causa de
 * megabyte é péssimo para quem só quer mandar as fotos do carro.
 *
 * Então em vez de recusar, encolhe: reduz a dimensão e recodifica em JPEG até
 * caber. É o que o próprio WhatsApp faz quando você manda foto pelo celular.
 *
 * Só mexe em imagem. Vídeo, áudio e documento passam intactos — recodificar
 * esses no navegador custaria caro e degradaria de forma visível.
 */

/** Acima disto, nenhuma tela de celular ou desktop ganha nada. */
const MAX_DIMENSION = 2560;

/** Do melhor para o pior; para no primeiro que couber. */
const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55];

export interface CompressResult {
  file: File;
  /** Verdadeiro quando o arquivo precisou ser reduzido. */
  changed: boolean;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Devolve o arquivo pronto para envio. Se já cabe, devolve o original — não
 * recodifica à toa, porque recodificar sempre perde alguma qualidade.
 */
export async function compressIfNeeded(file: File): Promise<CompressResult> {
  const kind = resolveMediaKind(file.type);
  const limit = kind ? LIMIT_FOR_KIND[kind] : null;

  if (kind !== "image" || limit === null || file.size <= limit) {
    return { file, changed: false };
  }

  // `from-image` respeita a orientação do EXIF: sem isso, foto tirada em pé
  // chega deitada do outro lado.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { file, changed: false };
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob || blob.size > limit) continue;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      file: new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified }),
      changed: true,
    };
  }

  // Nem na pior qualidade coube. Devolve o original para a validação recusar
  // com a mensagem própria dela — melhor que inventar um erro aqui.
  return { file, changed: false };
}
