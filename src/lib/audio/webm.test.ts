import { describe, expect, it } from "vitest";
import { extractOpusFromWebm } from "./webm";

/** Codifica um tamanho EBML com o bit marcador. */
function vintSize(value: number, length = 1): number[] {
  const bytes: number[] = [];
  for (let i = length - 1; i >= 0; i--) bytes.push((value >> (i * 8)) & 0xff);
  bytes[0]! |= 0x80 >> (length - 1);
  return bytes;
}

function idBytes(id: number): number[] {
  const bytes: number[] = [];
  let value = id;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return bytes;
}

function element(id: number, content: number[]): number[] {
  return [...idBytes(id), ...vintSize(content.length), ...content];
}

/** Elemento com tamanho desconhecido, como o MediaRecorder escreve ao gravar. */
function unknownSizeElement(id: number, content: number[]): number[] {
  return [...idBytes(id), 0xff, ...content];
}

function simpleBlock(frame: number[]): number[] {
  // faixa 1 (vint) + timecode (2 bytes) + flags (1 byte, sem lacing)
  return element(0xa3, [0x81, 0x00, 0x00, 0x80, ...frame]);
}

const OPUS_HEAD = [
  0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, // "OpusHead"
  0x01, // versão
  0x01, // canais
  0x00, 0x0f, // pre-skip
  0x80, 0xbb, 0x00, 0x00, // 48000 Hz
  0x00, 0x00, // ganho
  0x00, // mapeamento
];

describe("extractOpusFromWebm", () => {
  it("extrai CodecPrivate e blocos de áudio", () => {
    const file = new Uint8Array([
      ...element(0x18538067, [
        ...element(0x1654ae6b, [...element(0xae, [...element(0x63a2, OPUS_HEAD)])]),
        ...element(0x1f43b675, [...simpleBlock([0xfc, 0x01]), ...simpleBlock([0xfc, 0x02])]),
      ]),
    ]);

    const result = extractOpusFromWebm(file);

    expect(result.codecPrivate).toEqual(new Uint8Array(OPUS_HEAD));
    expect(result.packets).toHaveLength(2);
    expect(Array.from(result.packets[0]!)).toEqual([0xfc, 0x01]);
    expect(Array.from(result.packets[1]!)).toEqual([0xfc, 0x02]);
  });

  it("lida com Segment e Cluster de tamanho desconhecido", () => {
    // É exatamente o que o MediaRecorder produz: o arquivo é escrito em fluxo,
    // então o tamanho total ainda não é conhecido na hora da escrita.
    const file = new Uint8Array([
      ...unknownSizeElement(0x18538067, [
        ...element(0x1654ae6b, [...element(0xae, [...element(0x63a2, OPUS_HEAD)])]),
        ...unknownSizeElement(0x1f43b675, [...simpleBlock([0xfc, 0x0a])]),
      ]),
    ]);

    const result = extractOpusFromWebm(file);

    expect(result.codecPrivate).not.toBeNull();
    expect(result.packets).toHaveLength(1);
    expect(Array.from(result.packets[0]!)).toEqual([0xfc, 0x0a]);
  });

  it("lê blocos dentro de BlockGroup", () => {
    const file = new Uint8Array([
      ...element(0x18538067, [
        ...element(0x1f43b675, [
          ...element(0xa0, [...element(0xa1, [0x81, 0x00, 0x00, 0x80, 0xfc, 0x07])]),
        ]),
      ]),
    ]);

    expect(extractOpusFromWebm(file).packets).toHaveLength(1);
  });

  it("percorre vários clusters preservando a ordem", () => {
    const file = new Uint8Array([
      ...element(0x18538067, [
        ...element(0x1f43b675, [...simpleBlock([0x01])]),
        ...element(0x1f43b675, [...simpleBlock([0x02])]),
        ...element(0x1f43b675, [...simpleBlock([0x03])]),
      ]),
    ]);

    const packets = extractOpusFromWebm(file).packets;
    expect(packets.map((p) => p[0])).toEqual([0x01, 0x02, 0x03]);
  });

  it("descarta bloco com lacing em vez de entregar dado corrompido", () => {
    // flags 0x86 liga lacing; o MediaRecorder não usa isso para áudio.
    const file = new Uint8Array([
      ...element(0x18538067, [
        ...element(0x1f43b675, [...element(0xa3, [0x81, 0x00, 0x00, 0x86, 0x02, 0xfc])]),
      ]),
    ]);

    expect(extractOpusFromWebm(file).packets).toHaveLength(0);
  });

  it("não quebra com entrada vazia ou corrompida", () => {
    expect(extractOpusFromWebm(new Uint8Array(0)).packets).toEqual([]);
    expect(extractOpusFromWebm(new Uint8Array([0x00, 0x00, 0x00])).packets).toEqual([]);
    expect(extractOpusFromWebm(new Uint8Array([0x1f, 0x43, 0xb6, 0x75])).packets).toEqual([]);
  });
});
