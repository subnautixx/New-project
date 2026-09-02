import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  // Esta página precisa ser rastreável: a Meta exige que ela esteja
  // publicamente acessível, sem login e sem bloqueio a rastreadores.
  robots: { index: true, follow: true },
};

const ATUALIZADO_EM = "2 de setembro de 2026";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
        {titulo}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16">
      <Logo className="text-lg" />

      <h1 className="mt-10 font-display text-3xl font-bold tracking-[-0.02em] text-foreground">
        Política de Privacidade
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Atualizada em {ATUALIZADO_EM}
      </p>

      <div className="mt-10 space-y-10">
        <Secao titulo="Quem somos">
          <p>
            A 4FMOTORS é uma loja de consignação de veículos. Este sistema é uma ferramenta
            interna, usada apenas pela nossa equipe para organizar o atendimento aos clientes pelo
            WhatsApp. Não é um serviço aberto ao público e não há cadastro para terceiros.
          </p>
        </Secao>

        <Secao titulo="Que dados tratamos">
          <p>De quem entra em contato conosco pelo WhatsApp:</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground/50">
            <li>nome e número de telefone;</li>
            <li>o conteúdo das mensagens trocadas, incluindo fotos, áudios e documentos enviados;</li>
            <li>informações do veículo que a pessoa nos apresenta, como marca, modelo, ano e o
              link do anúncio;</li>
            <li>anotações que nossa equipe escreve sobre o atendimento;</li>
            <li>foto do contato, apenas quando alguém da equipe a adiciona manualmente.</li>
          </ul>
          <p>
            Da nossa própria equipe: nome, e-mail e o registro das ações feitas no sistema.
          </p>
          <p>
            Não coletamos dado de pagamento, documento de identidade, localização nem dado sensível.
            Não usamos rastreadores de publicidade e não fazemos perfil comportamental.
          </p>
        </Secao>

        <Secao titulo="Para que usamos">
          <p>
            Exclusivamente para atender quem nos procurou: responder mensagens, acompanhar a
            negociação de consignação do veículo e organizar o trabalho da equipe. Nada além disso.
          </p>
          <p>
            <strong className="text-foreground">Não vendemos, alugamos nem compartilhamos</strong>{" "}
            esses dados com terceiros para fins comerciais, e não os usamos para publicidade.
          </p>
        </Secao>

        <Secao titulo="Com quem os dados são compartilhados">
          <p>Apenas com os serviços necessários para o sistema funcionar:</p>
          <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground/50">
            <li>
              <strong className="text-foreground">Meta (WhatsApp Business Platform)</strong> —
              entrega e recebimento das mensagens. Usamos apenas a API oficial.
            </li>
            <li>
              <strong className="text-foreground">Supabase</strong> — armazenamento do banco de
              dados e dos arquivos.
            </li>
          </ul>
          <p>
            Dentro da nossa equipe, o acesso é restrito: cada consignador enxerga somente os
            próprios clientes e conversas. Essa separação é aplicada no banco de dados, não apenas
            na tela.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Mantemos o histórico enquanto a relação comercial fizer sentido, e depois pelo prazo
            necessário para cumprir obrigações legais. Quando alguém pede a exclusão, apagamos os
            dados salvo aqueles que a lei nos obriga a reter.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir a qualquer momento para
            confirmar se tratamos dados seus, acessá-los, corrigi-los, solicitar a exclusão ou
            revogar o consentimento para receber mensagens.
          </p>
          <p>
            Para exercer qualquer um desses direitos, basta responder no mesmo WhatsApp em que
            conversamos, ou escrever para o e-mail abaixo. Respondemos em até 15 dias.
          </p>
        </Secao>

        <Secao titulo="Como parar de receber mensagens">
          <p>
            Responda <strong className="text-foreground">SAIR</strong> na conversa do WhatsApp.
            Registramos o pedido e paramos de enviar mensagens para aquele número.
          </p>
        </Secao>

        <Secao titulo="Segurança">
          <p>
            O acesso ao sistema exige login individual. As credenciais de integração ficam
            armazenadas apenas no servidor, sem acesso pelo navegador. A comunicação trafega
            criptografada.
          </p>
        </Secao>

        <Secao titulo="Contato">
          <p>
            Dúvidas sobre esta política ou sobre seus dados:{" "}
            <a
              href="mailto:iracipsantos7@gmail.com"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              iracipsantos7@gmail.com
            </a>
          </p>
        </Secao>

        <Secao titulo="Alterações">
          <p>
            Se esta política mudar, atualizamos a data no topo desta página. Mudanças relevantes
            serão comunicadas pelos canais de atendimento.
          </p>
        </Secao>
      </div>
    </main>
  );
}
