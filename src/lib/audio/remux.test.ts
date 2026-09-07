import { describe, expect, it } from "vitest";
import { buildOpusHead, buildOpusTags, opusPacketSamples, parseOpusHead } from "./opus";
import { normalizeAudioMimeType, opusDurationSeconds, pickRecordingMimeType, remuxWebmToOgg } from "./remux";

describe("opusPacketSamples", () => {
  it("calcula 20 ms para o TOC típico do MediaRecorder", () => {
    // config 15 (híbrido FB, 20 ms), 1 frame -> 960 amostras a 48 kHz.
    expect(opusPacketSamples(new Uint8Array([15 << 3]))).toBe(960);
  });

  it("cobre as durações do modo CELT", () => {
    expect(opusPacketSamples(new Uint8Array([16 << 3]))).toBe(120); // 2,5 ms
    expect(opusPacketSamples(new Uint8Array([17 << 3]))).toBe(240); // 5 ms
    expect(opusPacketSamples(new Uint8Array([18 << 3]))).toBe(480); // 10 ms
    expect(opusPacketSamples(new Uint8Array([19 << 3]))).toBe(960); // 20 ms
  });

  it("cobre os frames longos do modo SILK", () => {
    expect(opusPacketSamples(new Uint8Array([3 << 3]))).toBe(2880); // 60 ms
  });

  it("multiplica pela quantidade de frames", () => {
    // Código 1 = 2 frames de 20 ms.
    expect(opusPacketSamples(new Uint8Array([(15 << 3) | 1]))).toBe(1920);
    // Código 3 = quantidade arbitrária no byte seguinte.
    expect(opusPacketSamples(new Uint8Array([(19 << 3) | 3, 3]))).toBe(2880);
  });

  it("devolve zero para pacote vazio ou impossível", () => {
    expect(opusPacketSamples(new Uint8Array(0))).toBe(0);
    expect(opusPacketSamples(new Uint8Array([(19 << 3) | 3]))).toBe(0); // falta o byte
    expect(opusPacketSamples(new Uint8Array([(3 << 3) | 3, 40]))).toBe(0); // passa de 120 ms
  });
});

describe("OpusHead", () => {
  it("faz round-trip de construção e leitura", () => {
    const head = { channels: 1, preSkip: 3840, inputSampleRate: 48000 };
    expect(parseOpusHead(buildOpusHead(head))).toEqual(head);
  });

  it("recusa dado que não é OpusHead", () => {
    expect(parseOpusHead(new Uint8Array(19))).toBeNull();
    expect(parseOpusHead(new Uint8Array(4))).toBeNull();
  });

  it("gera OpusTags com o comprimento do vendor correto", () => {
    const tags = buildOpusTags("teste");
    expect(String.fromCharCode(...tags.subarray(0, 8))).toBe("OpusTags");
    expect(new DataView(tags.buffer).getUint32(8, true)).toBe(5);
  });
});

/** Monta um WebM mínimo com pacotes Opus de 20 ms. */
function fakeWebm(packetCount: number): Uint8Array {
  const bytes: number[] = [];

  const head = Array.from(buildOpusHead({ channels: 1, preSkip: 3840, inputSampleRate: 48000 }));

  const codecPrivate = [0x63, 0xa2, 0x80 | head.length, ...head];
  const trackEntry = [0xae, 0x80 | codecPrivate.length, ...codecPrivate];
  const tracks = [0x16, 0x54, 0xae, 0x6b, 0x80 | trackEntry.length, ...trackEntry];

  const blocks: number[] = [];
  for (let i = 0; i < packetCount; i++) {
    const frame = [15 << 3, i & 0xff, 0x55];
    const block = [0x81, 0x00, 0x00, 0x80, ...frame];
    blocks.push(0xa3, 0x80 | block.length, ...block);
  }

  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0xff, ...blocks];
  const segmentContent = [...tracks, ...cluster];

  bytes.push(0x18, 0x53, 0x80, 0x67, 0xff, ...segmentContent);

  return new Uint8Array(bytes);
}

describe("remuxWebmToOgg", () => {
  it("converte WebM em Ogg preservando a quantidade de pacotes", () => {
    const result = remuxWebmToOgg(fakeWebm(50));

    expect(result.ok).toBe(true);
    expect(result.blob?.type).toBe("audio/ogg");
    expect(result.blob!.size).toBeGreaterThan(0);
  });

  it("produz um arquivo que começa com a assinatura Ogg", async () => {
    const result = remuxWebmToOgg(fakeWebm(5));
    const bytes = new Uint8Array(await result.blob!.arrayBuffer());

    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("OggS");
    // Segunda página começa com OpusTags, exigido pelo mapeamento Opus-in-Ogg.
    expect(new TextDecoder().decode(bytes).includes("OpusTags")).toBe(true);
  });

  it("calcula a duração a partir dos pacotes", () => {
    // 50 pacotes de 20 ms = 1 segundo.
    expect(opusDurationSeconds(fakeWebm(50))).toBeCloseTo(1, 3);
  });

  it("falha com mensagem clara quando não há áudio", () => {
    const result = remuxWebmToOgg(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));

    expect(result.ok).toBe(false);
    expect(result.blob).toBeNull();
    expect(result.error).toContain("Nenhum áudio");
  });
});

describe("pickRecordingMimeType", () => {
  it("prefere ogg quando o navegador oferece (Firefox)", () => {
    const supported = new Set(["audio/ogg;codecs=opus", "audio/webm;codecs=opus"]);
    expect(pickRecordingMimeType((t) => supported.has(t))).toEqual({
      mimeType: "audio/ogg;codecs=opus",
      needsRemux: false,
    });
  });

  /**
   * Regressão do bug que derrubou o envio de áudio em produção.
   *
   * Este é o Chrome de hoje, medido no Chromium 141: grava WebM/Opus e também
   * `audio/mp4`. A versão anterior escolhia o MP4 por dispensar o remux, e a
   * Meta recusava todo áudio com o código 131053. Tem que sair Opus.
   */
  it("escolhe webm com remux no Chrome, mesmo com mp4 disponível", () => {
    const supported = new Set(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
    expect(pickRecordingMimeType((t) => supported.has(t))).toEqual({
      mimeType: "audio/webm;codecs=opus",
      needsRemux: true,
    });
  });

  it("cai para webm com remux quando não há mp4", () => {
    const supported = new Set(["audio/webm;codecs=opus", "audio/webm"]);
    expect(pickRecordingMimeType((t) => supported.has(t))).toEqual({
      mimeType: "audio/webm;codecs=opus",
      needsRemux: true,
    });
  });

  it("usa mp4 no Safari, onde não existe outra opção", () => {
    const supported = new Set(["audio/mp4"]);
    expect(pickRecordingMimeType((t) => supported.has(t))).toEqual({
      mimeType: "audio/mp4",
      needsRemux: false,
    });
  });

  it("nunca escolhe mp4 havendo qualquer caminho para Opus", () => {
    for (const opus of ["audio/ogg;codecs=opus", "audio/ogg", "audio/webm;codecs=opus", "audio/webm"]) {
      const supported = new Set(["audio/mp4", "audio/aac", opus]);
      expect(pickRecordingMimeType((t) => supported.has(t))?.mimeType).toBe(opus);
    }
  });

  it("devolve null quando nada serve", () => {
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });
});

describe("normalizeAudioMimeType", () => {
  it("reporta ogg quando houve remux", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus", true)).toBe("audio/ogg");
  });

  it("remove os parâmetros de codec, que a Meta não espera", () => {
    expect(normalizeAudioMimeType("audio/ogg;codecs=opus", false)).toBe("audio/ogg");
    expect(normalizeAudioMimeType("audio/mp4", false)).toBe("audio/mp4");
  });
});
