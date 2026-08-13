/**
 * Leitor EBML mínimo — só o suficiente para extrair pacotes Opus de um WebM
 * produzido pelo MediaRecorder.
 *
 * Não é um parser de Matroska completo, e não precisa ser: o objetivo é achar
 * o CodecPrivate (OpusHead) e os blocos de áudio, na ordem. Tudo que não
 * interessa é pulado pelo tamanho declarado.
 */

const ID_SEGMENT = 0x18538067;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_CODEC_ID = 0x86;
const ID_CLUSTER = 0x1f43b675;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK_GROUP = 0xa0;
const ID_BLOCK = 0xa1;

/** Elementos em que precisamos entrar. Os demais são pulados inteiros. */
const MASTER_IDS = new Set([ID_SEGMENT, ID_TRACKS, ID_TRACK_ENTRY, ID_CLUSTER, ID_BLOCK_GROUP]);

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

/** Lê o ID de um elemento: os bytes vão inteiros, com o marcador. */
function readElementId(data: Uint8Array, pos: number): Vint | null {
  const first = data[pos];
  if (first === undefined || first === 0) return null;

  let length = 1;
  for (let mask = 0x80; mask > 0 && (first & mask) === 0; mask >>= 1) length++;
  if (length > 4 || pos + length > data.length) return null;

  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + data[pos + i]!;

  return { value, length, unknown: false };
}

/** Lê o tamanho: o bit marcador é descartado. */
function readElementSize(data: Uint8Array, pos: number): Vint | null {
  const first = data[pos];
  if (first === undefined || first === 0) return null;

  let length = 1;
  for (let mask = 0x80; mask > 0 && (first & mask) === 0; mask >>= 1) length++;
  if (length > 8 || pos + length > data.length) return null;

  let value = first & (0xff >> length);
  let allOnes = value === (0xff >> length);

  for (let i = 1; i < length; i++) {
    const byte = data[pos + i]!;
    if (byte !== 0xff) allOnes = false;
    value = value * 256 + byte;
  }

  // Tamanho "desconhecido" (todos os bits em 1): o MediaRecorder usa isso em
  // Segment e Cluster porque escreve o arquivo enquanto grava.
  return { value, length, unknown: allOnes };
}

/**
 * Extrai o payload de um SimpleBlock ou Block.
 * Assume lacing desativado, que é o que o MediaRecorder gera para áudio.
 */
function readBlockFrame(block: Uint8Array): Uint8Array | null {
  const track = readElementSize(block, 0);
  if (!track) return null;

  // número da faixa + timecode (2) + flags (1)
  const headerLength = track.length + 3;
  if (block.length <= headerLength) return null;

  const flags = block[track.length + 2]!;
  const lacing = (flags >> 1) & 0b11;

  // Com lacing, um bloco carrega vários frames. O MediaRecorder não usa isso
  // para áudio; se aparecer, é mais honesto descartar do que entregar lixo.
  if (lacing !== 0) return null;

  return block.subarray(headerLength);
}

export interface WebmOpusData {
  codecPrivate: Uint8Array | null;
  packets: Uint8Array[];
}

/**
 * Percorre o arquivo recolhendo o CodecPrivate e os pacotes de áudio.
 * Nunca lança: entrada corrompida devolve o que deu para ler.
 */
export function extractOpusFromWebm(buffer: ArrayBuffer | Uint8Array): WebmOpusData {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const result: WebmOpusData = { codecPrivate: null, packets: [] };

  walk(data, 0, data.length, result, 0);

  return result;
}

function walk(
  data: Uint8Array,
  start: number,
  end: number,
  result: WebmOpusData,
  depth: number,
): void {
  // Guarda contra arquivo malformado que aninhe indefinidamente.
  if (depth > 12) return;

  let pos = start;

  while (pos < end) {
    const id = readElementId(data, pos);
    if (!id) return;

    const size = readElementSize(data, pos + id.length);
    if (!size) return;

    const contentStart = pos + id.length + size.length;

    // Tamanho desconhecido: o conteúdo vai até o fim do escopo atual.
    const contentEnd = size.unknown
      ? end
      : Math.min(contentStart + size.value, end);

    if (contentStart > end) return;

    if (MASTER_IDS.has(id.value)) {
      walk(data, contentStart, contentEnd, result, depth + 1);

      // Elemento de tamanho desconhecido consome o resto do escopo.
      if (size.unknown) return;
    } else if (id.value === ID_CODEC_PRIVATE) {
      if (!result.codecPrivate) {
        result.codecPrivate = data.subarray(contentStart, contentEnd);
      }
    } else if (id.value === ID_SIMPLE_BLOCK || id.value === ID_BLOCK) {
      const frame = readBlockFrame(data.subarray(contentStart, contentEnd));
      if (frame && frame.length > 0) result.packets.push(frame);
    } else if (id.value === ID_CODEC_ID) {
      // Lido apenas para diagnóstico; a decisão real vem do OpusHead.
    }

    pos = contentEnd;

    // Sem avanço, o laço giraria para sempre.
    if (contentEnd <= pos - 1) return;
  }
}
