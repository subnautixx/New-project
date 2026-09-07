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

/**
 * Formatos de foto que o WhatsApp não aceita mas que vale converter para JPEG.
 *
 * HEIC é o caso de todo dia: é o padrão de foto do iPhone. Antes a foto era
 * recusada mesmo cabendo no tamanho, e a pessoa não tinha o que fazer além de
 * converter por fora.
 *
 * GIF fica de fora de propósito: converter para JPEG mataria a animação sem
 * avisar. Melhor recusar e a pessoa entender o porquê.
 */
const CONVERTIBLE_IMAGE_TYPES = [
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
];

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
  const limit = LIMIT_FOR_KIND.image;

  const imagemNaoSuportada = CONVERTIBLE_IMAGE_TYPES.includes(
    file.type.split(";")[0]?.trim().toLowerCase() ?? "",
  );

  if (!imagemNaoSuportada) {
    // Formato aceito que já cabe: devolve intacto, sem perder qualidade à toa.
    if (kind !== "image" || file.size <= limit) return { file, changed: false };
  }

  let bitmap: ImageBitmap;

  try {
    // `from-image` respeita a orientação do EXIF: sem isso, foto tirada em pé
    // chega deitada do outro lado.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Navegador não decodifica este formato. Quem recusa é a validação.
    return { file, changed: false };
  }

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
