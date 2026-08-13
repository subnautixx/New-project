import { describe, expect, it } from "vitest";
import { oggCrc32, writeOggStream, type OggPacket } from "./ogg";

/**
 * Leitor de Ogg escrito só para o teste. Reconstruir os pacotes a partir do
 * arquivo gerado é o que prova que o lacing e as páginas estão corretos —
 * verificar campo a campo não pegaria um erro de fronteira de segmento.
 */
interface ParsedPage {
  headerType: number;
  granulePosition: number;
  serial: number;
  sequence: number;
  crcValid: boolean;
  segments: number[];
  payload: Uint8Array;
}

function parseOggPages(data: Uint8Array): ParsedPage[] {
  const pages: ParsedPage[] = [];
  let pos = 0;

  while (pos < data.length) {
    expect(String.fromCharCode(...data.subarray(pos, pos + 4))).toBe("OggS");

    const view = new DataView(data.buffer, data.byteOffset + pos);
    const segmentCount = data[pos + 26]!;
    const segments = Array.from(data.subarray(pos + 27, pos + 27 + segmentCount));
    const payloadLength = segments.reduce((sum, s) => sum + s, 0);
    const headerLength = 27 + segmentCount;

    // O CRC é calculado com o próprio campo zerado.
    const pageBytes = data.slice(pos, pos + headerLength + payloadLength);
    const storedCrc = new DataView(pageBytes.buffer).getUint32(22, true);
    new DataView(pageBytes.buffer).setUint32(22, 0, true);

    pages.push({
      headerType: data[pos + 5]!,
      granulePosition: view.getUint32(6, true),
      serial: view.getUint32(14, true),
      sequence: view.getUint32(18, true),
      crcValid: oggCrc32(pageBytes) === storedCrc,
      segments,
      payload: data.slice(pos + headerLength, pos + headerLength + payloadLength),
    });

    pos += headerLength + payloadLength;
  }

  return pages;
}

/** Remonta os pacotes seguindo as regras de lacing. */
function reassemblePackets(pages: ParsedPage[]): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let current: number[] = [];

  for (const page of pages) {
    let offset = 0;

    for (const segment of page.segments) {
      current.push(...page.payload.subarray(offset, offset + segment));
      offset += segment;

      // Segmento menor que 255 encerra o pacote.
      if (segment < 255) {
        packets.push(new Uint8Array(current));
        current = [];
      }
    }
  }

  return packets;
}

function packet(byte: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(byte);
}

const HEADER = new TextEncoder().encode("OpusHead-fake");
const TAGS = new TextEncoder().encode("OpusTags-fake");

describe("writeOggStream", () => {
  it("gera páginas válidas com CRC correto", () => {
    const audio: OggPacket[] = [
      { data: packet(1, 40), granulePosition: 960 },
      { data: packet(2, 50), granulePosition: 1920 },
    ];

    const pages = parseOggPages(writeOggStream(HEADER, TAGS, audio, 12345));

    expect(pages.every((p) => p.crcValid)).toBe(true);
    expect(pages.every((p) => p.serial === 12345)).toBe(true);
    expect(pages.map((p) => p.sequence)).toEqual([0, 1, 2]);
  });

  it("marca início e fim do fluxo", () => {
    const pages = parseOggPages(
      writeOggStream(HEADER, TAGS, [{ data: packet(1, 10), granulePosition: 960 }], 1),
    );

    expect(pages[0]?.headerType).toBe(0x02); // BOS
    expect(pages[pages.length - 1]?.headerType).toBe(0x04); // EOS
  });

  it("põe cabeçalho e tags cada um em sua própria página", () => {
    const pages = parseOggPages(
      writeOggStream(HEADER, TAGS, [{ data: packet(1, 10), granulePosition: 960 }], 1),
    );

    expect(pages[0]?.payload).toEqual(HEADER);
    expect(pages[1]?.payload).toEqual(TAGS);
    expect(pages[0]?.granulePosition).toBe(0);
    expect(pages[1]?.granulePosition).toBe(0);
  });

  it("preserva os pacotes exatamente (round-trip)", () => {
    const audio: OggPacket[] = [
      { data: packet(0xaa, 13), granulePosition: 960 },
      { data: packet(0xbb, 300), granulePosition: 1920 },
      { data: packet(0xcc, 7), granulePosition: 2880 },
    ];

    const pages = parseOggPages(writeOggStream(HEADER, TAGS, audio, 7));
    const packets = reassemblePackets(pages);

    expect(packets).toHaveLength(5); // cabeçalho + tags + 3 de áudio
    expect(packets[2]).toEqual(audio[0]!.data);
    expect(packets[3]).toEqual(audio[1]!.data);
    expect(packets[4]).toEqual(audio[2]!.data);
  });

  it("fecha com segmento zero quando o pacote é múltiplo de 255", () => {
    // Sem o segmento final de 0, o leitor acharia que o pacote continua.
    const audio: OggPacket[] = [{ data: packet(9, 510), granulePosition: 960 }];

    const pages = parseOggPages(writeOggStream(HEADER, TAGS, audio, 1));
    const audioPage = pages[2]!;

    expect(audioPage.segments).toEqual([255, 255, 0]);
    expect(reassemblePackets(pages)[2]).toEqual(audio[0]!.data);
  });

  it("quebra em várias páginas ao passar de 255 segmentos", () => {
    const audio: OggPacket[] = Array.from({ length: 300 }, (_, i) => ({
      data: packet(i % 251, 20),
      granulePosition: (i + 1) * 960,
    }));

    const pages = parseOggPages(writeOggStream(HEADER, TAGS, audio, 1));

    expect(pages.length).toBeGreaterThan(3);
    expect(pages.every((p) => p.segments.length <= 255)).toBe(true);
    expect(pages.every((p) => p.crcValid)).toBe(true);
    expect(reassemblePackets(pages)).toHaveLength(302);
  });

  it("avança o granule monotonicamente nas páginas de áudio", () => {
    const audio: OggPacket[] = Array.from({ length: 400 }, (_, i) => ({
      data: packet(1, 20),
      granulePosition: (i + 1) * 960,
    }));

    const audioPages = parseOggPages(writeOggStream(HEADER, TAGS, audio, 1)).slice(2);
    const granules = audioPages.map((p) => p.granulePosition);

    expect(granules).toEqual([...granules].sort((a, b) => a - b));
    expect(granules[granules.length - 1]).toBe(400 * 960);
  });
});

describe("oggCrc32", () => {
  it("é determinístico e sensível a qualquer alteração", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const alterado = new Uint8Array([1, 2, 3, 4, 6]);

    expect(oggCrc32(data)).toBe(oggCrc32(data));
    expect(oggCrc32(data)).not.toBe(oggCrc32(alterado));
  });

  it("devolve zero para entrada vazia", () => {
    expect(oggCrc32(new Uint8Array(0))).toBe(0);
  });
});
