import { publicEnv } from "@/lib/env";

/**
 * Upload para a URL assinada do Storage COM progresso real.
 *
 * O `fetch` do navegador não informa quanto do corpo já subiu; o
 * XMLHttpRequest informa (`upload.onprogress`). Como um vídeo de 16 MB numa
 * conexão de loja leva bem mais de um minuto, uma barra inventada por
 * temporizador mentiria — e é justamente aí que alguém desiste e clica de novo.
 *
 * O token da URL assinada nunca é registrado em log nem devolvido em mensagem
 * de erro: ele vale como credencial de escrita naquele caminho.
 */

export interface UploadResult {
  ok: boolean;
  /** Texto pronto para a tela; nunca contém o token. */
  error: string | null;
}

export interface UploadParams {
  bucket: string;
  path: string;
  token: string;
  file: File;
  /** 0 a 100. Chamado várias vezes durante o envio. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function signedUploadUrl(bucket: string, path: string, token: string): string {
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/upload/sign/${bucket}/${encoded}?token=${encodeURIComponent(token)}`;
}

export function uploadToSignedUrl(params: UploadParams): Promise<UploadResult> {
  const { bucket, path, token, file, onProgress, signal } = params;

  return new Promise<UploadResult>((resolve) => {
    if (typeof XMLHttpRequest === "undefined") {
      resolve({ ok: false, error: "Envio de arquivo indisponível neste navegador." });
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    xhr.open("PUT", signedUploadUrl(bucket, path, token), true);
    xhr.timeout = 180_000;
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    // O bucket é privado e o caminho tem sufixo único; `x-upsert` só evita
    // falha boba se a mesma tentativa for repetida.
    xhr.setRequestHeader("x-upsert", "false");
    if (publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY) xhr.setRequestHeader("apikey", publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY);

    const finish = (result: UploadResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      xhr.upload.onprogress = null;
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
      resolve(result);
    };

    function onAbort() {
      xhr.abort();
    }

    if (signal) {
      if (signal.aborted) {
        finish({ ok: false, error: "Envio cancelado." });
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (settled || !event.lengthComputable || event.total <= 0) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
    }

    xhr.onload = () => {
      if (settled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        finish({ ok: true, error: null });
        return;
      }
      finish({
        ok: false,
        error:
          xhr.status === 413
            ? "Arquivo grande demais para o envio."
            : "Falha ao enviar o arquivo. Verifique sua conexão.",
      });
    };

    xhr.onerror = () => finish({ ok: false, error: "Falha ao enviar o arquivo. Verifique sua conexão." });
    xhr.ontimeout = () => finish({ ok: false, error: "O envio do arquivo demorou demais." });
    xhr.onabort = () => finish({ ok: false, error: "Envio cancelado." });

    try {
      xhr.send(file);
    } catch {
      finish({ ok: false, error: "Não foi possível iniciar o envio do arquivo." });
    }
  });
}
