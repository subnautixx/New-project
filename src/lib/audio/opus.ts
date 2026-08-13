/**
 * Leitura do cabeçalho TOC de um pacote Opus (RFC 6716, seção 3.1).
 *
 * Serve para calcular a posição de granule das páginas Ogg. Chutar 20 ms por
 * pacote funcionaria na maioria dos casos, mas um áudio com pacotes de duração
 * diferente ficaria com a duração errada — e o WhatsApp mostra essa duração na
 * bolha antes mesmo de tocar.
 */

/** Duração de um frame, em microssegundos, por índice de configuração. */
const FRAME_DURATION_US: number[] = [
  // 0-11: SILK, ciclos de 10/20/40/60 ms
  10000, 20000, 40000, 60000,
  10000, 20000, 40000, 60000,
  10000, 20000, 40000, 60000,
  // 12-15: híbrido, 10/20 ms
  10000, 20000,
  10000, 20000,
  // 16-31: CELT, ciclos de 2.5/5/10/20 ms
  2500, 5000, 10000, 20000,
  2500, 5000, 10000, 20000,
  2500, 5000, 10000, 20000,
  2500, 5000, 10000, 20000,
];

/** Opus sempre reporta granule em 48 kHz, qualquer que seja a taxa interna. */
export const OPUS_GRANULE_RATE = 48000;

/**
 * Quantidade de amostras (a 48 kHz) que um pacote representa.
 * Retorna 0 para pacote vazio ou malformado, para não corromper o granule.
 */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length < 1) return 0;

  const toc = packet[0]!;
  const config = toc >> 3;
  const frameCountCode = toc & 0b11;

  const frameDurationUs = FRAME_DURATION_US[config];
  if (frameDurationUs === undefined) return 0;

  let frames: number;

  switch (frameCountCode) {
    case 0:
      frames = 1;
      break;
    case 1:
    case 2:
      frames = 2;
      break;
    default: {
      // Código 3: a quantidade vem nos 6 bits baixos do byte seguinte.
      if (packet.length < 2) return 0;
      frames = packet[1]! & 0b0011_1111;
      break;
    }
  }

  if (frames < 1 || frames > 48) return 0;

  const totalUs = frameDurationUs * frames;

  // O limite do formato é 120 ms por pacote.
  if (totalUs > 120000) return 0;

  return (totalUs * OPUS_GRANULE_RATE) / 1_000_000;
}

export interface OpusHead {
  channels: number;
  preSkip: number;
  inputSampleRate: number;
}

/** Lê o OpusHead que o WebM guarda em CodecPrivate. */
export function parseOpusHead(data: Uint8Array): OpusHead | null {
  if (data.length < 19) return null;

  const magic = String.fromCharCode(...data.subarray(0, 8));
  if (magic !== "OpusHead") return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    channels: data[9]!,
    preSkip: view.getUint16(10, true),
    inputSampleRate: view.getUint32(12, true),
  };
}

/** Monta um OpusHead válido quando o arquivo não trouxe CodecPrivate. */
export function buildOpusHead(head: OpusHead): Uint8Array {
  const data = new Uint8Array(19);
  const view = new DataView(data.buffer);

  data.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  data[8] = 1; // versão
  data[9] = head.channels;
  view.setUint16(10, head.preSkip, true);
  view.setUint32(12, head.inputSampleRate, true);
  view.setUint16(16, 0, true); // ganho de saída
  data[18] = 0; // família de mapeamento: mono/estéreo

  return data;
}

/** OpusTags mínimo, exigido como segundo pacote do fluxo Ogg. */
export function buildOpusTags(vendor = "4FMOTORS CRM"): Uint8Array {
  const vendorBytes = new TextEncoder().encode(vendor);
  const data = new Uint8Array(8 + 4 + vendorBytes.length + 4);
  const view = new DataView(data.buffer);

  data.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
  view.setUint32(8, vendorBytes.length, true);
  data.set(vendorBytes, 12);
  view.setUint32(12 + vendorBytes.length, 0, true); // zero comentários

  return data;
}
