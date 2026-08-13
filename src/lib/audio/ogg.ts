/**
 * Escritor de contêiner Ogg (RFC 3533), suficiente para encapsular Opus.
 *
 * Ogg usa CRC-32 com polinômio 0x04C11DB7 SEM reflexão de bits e sem XOR
 * final — diferente do CRC-32 comum de ZIP/PNG. Usar o algoritmo errado gera
 * um arquivo que alguns players aceitam e outros recusam silenciosamente.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      r = (r & 0x8000_0000) !== 0 ? ((r << 1) ^ 0x04c1_1db7) >>> 0 : (r << 1) >>> 0;
    }
    table[i] = r >>> 0;
  }

  return table;
})();

export function oggCrc32(data: Uint8Array): number {
  let crc = 0;

  for (const byte of data) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  }

  return crc >>> 0;
}

export interface OggPacket {
  data: Uint8Array;
  /** Amostras acumuladas até o fim deste pacote. */
  granulePosition: number;
}

const MAX_SEGMENTS_PER_PAGE = 255;
const MAX_SEGMENT_SIZE = 255;

/** Divide um pacote nos valores de lacing do Ogg. */
function laceValues(length: number): number[] {
  const values: number[] = [];
  let remaining = length;

  while (remaining >= MAX_SEGMENT_SIZE) {
    values.push(MAX_SEGMENT_SIZE);
    remaining -= MAX_SEGMENT_SIZE;
  }

  // Um pacote múltiplo exato de 255 exige um segmento final de 0, senão o
  // leitor acha que ele continua na próxima página.
  values.push(remaining);

  return values;
}

interface PageInput {
  packets: OggPacket[];
  headerType: number;
  granulePosition: number;
  serial: number;
  sequence: number;
}

function buildPage(input: PageInput): Uint8Array {
  const segments: number[] = [];
  let payloadLength = 0;

  for (const packet of input.packets) {
    segments.push(...laceValues(packet.data.length));
    payloadLength += packet.data.length;
  }

  const page = new Uint8Array(27 + segments.length + payloadLength);
  const view = new DataView(page.buffer);

  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0; // versão
  page[5] = input.headerType;

  // Granule é int64 LE. Os valores aqui cabem folgadamente em 32 bits para
  // qualquer áudio de duração razoável, mas o campo é escrito por inteiro.
  view.setUint32(6, input.granulePosition >>> 0, true);
  view.setUint32(10, Math.floor(input.granulePosition / 0x1_0000_0000), true);

  view.setUint32(14, input.serial, true);
  view.setUint32(18, input.sequence, true);
  view.setUint32(22, 0, true); // CRC entra depois, com o campo zerado
  page[26] = segments.length;

  page.set(segments, 27);

  let offset = 27 + segments.length;
  for (const packet of input.packets) {
    page.set(packet.data, offset);
    offset += packet.data.length;
  }

  view.setUint32(22, oggCrc32(page), true);

  return page;
}

/**
 * Empacota os pacotes num fluxo Ogg.
 *
 * Cabeçalho e tags ficam cada um em sua própria página, como o mapeamento
 * Opus-in-Ogg exige. Os pacotes de áudio são agrupados respeitando o teto de
 * 255 segmentos por página.
 */
export function writeOggStream(
  headerPacket: Uint8Array,
  tagsPacket: Uint8Array,
  audioPackets: OggPacket[],
  serial: number,
): Uint8Array {
  const pages: Uint8Array[] = [];
  let sequence = 0;

  pages.push(
    buildPage({
      packets: [{ data: headerPacket, granulePosition: 0 }],
      headerType: 0x02, // início do fluxo
      granulePosition: 0,
      serial,
      sequence: sequence++,
    }),
  );

  pages.push(
    buildPage({
      packets: [{ data: tagsPacket, granulePosition: 0 }],
      headerType: 0,
      granulePosition: 0,
      serial,
      sequence: sequence++,
    }),
  );

  let pending: OggPacket[] = [];
  let pendingSegments = 0;

  const flush = (isLast: boolean) => {
    if (pending.length === 0) return;

    pages.push(
      buildPage({
        packets: pending,
        headerType: isLast ? 0x04 : 0, // fim do fluxo
        granulePosition: pending[pending.length - 1]!.granulePosition,
        serial,
        sequence: sequence++,
      }),
    );

    pending = [];
    pendingSegments = 0;
  };

  for (const packet of audioPackets) {
    const needed = laceValues(packet.data.length).length;

    // Um pacote nunca é partido entre páginas aqui: fecha a página antes.
    if (pendingSegments + needed > MAX_SEGMENTS_PER_PAGE) flush(false);

    pending.push(packet);
    pendingSegments += needed;
  }

  if (pending.length > 0) {
    flush(true);
  } else if (pages.length > 0) {
    // Sem áudio: marca o fim do fluxo numa página vazia para o arquivo fechar.
    pages.push(
      buildPage({
        packets: [],
        headerType: 0x04,
        granulePosition: 0,
        serial,
        sequence: sequence++,
      }),
    );
  }

  const total = pages.reduce((sum, page) => sum + page.length, 0);
  const output = new Uint8Array(total);

  let offset = 0;
  for (const page of pages) {
    output.set(page, offset);
    offset += page.length;
  }

  return output;
}
