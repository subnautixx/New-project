# 4FMOTORS CRM

WhatsApp + Clientes + Produtividade. Nada além disso.

CRM interno para a operação de consignação da 4FMOTORS: os consignadores
encontram donos de veículos em anúncios, cadastram como prospect, atendem pelo
WhatsApp e o administrador acompanha a operação inteira.

---

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Radix/shadcn · Supabase
(Postgres, Auth, Realtime) · Meta WhatsApp Cloud API · Vercel.

Nada além disso foi adicionado.

---

## Arquitetura em uma página

### Uma arquitetura, três modos de WhatsApp

Não existem três sistemas. Existe uma tabela `whatsapp_accounts` (cada linha é
um número) e uma tabela `user_whatsapp_permissions` (N:N entre usuário e
número). Os três modos são consequência dos dados, não do código:

| Modo | Como fica no banco |
|---|---|
| **Compartilhado** | um número `mode = 'shared'` com vários usuários em `user_whatsapp_permissions` |
| **Individual** | vários números `mode = 'individual'`, cada um com um usuário |
| **Híbrido** | os dois casos acima coexistindo, sem nenhuma mudança de código |

O que separa as conversas é `conversations.assigned_user_id` — o responsável.
Breno vê as conversas dele, Júlio as dele, mesmo usando o mesmo número. E toda
mensagem enviada pelo CRM grava `sent_by_user_id`, então no número
compartilhado sempre se sabe quem falou.

### Segurança: o frontend não é a proteção

A autorização vive em três camadas, e a de baixo é a que vale:

1. **RLS no Postgres** — um consignador que chamar a API do Supabase
   diretamente com o próprio token continua vendo só o que é dele.
2. **Guards por trigger** — o que a RLS não alcança porque depende do valor
   anterior: transferir cliente/conversa e alterar papel são exclusivos do
   admin.
3. **Verificação nas rotas de API** — antes de qualquer efeito colateral.

Detalhes que importam:

- `whatsapp_account_secrets` não tem **nenhuma** policy. Nem o admin logado lê
  os tokens pelo cliente — só o backend com `service_role`.
- Desativar um usuário derruba o acesso **no banco** (`auth_uid_active()`
  ignora perfis inativos), não apenas na interface.
- O papel do usuário nunca vem do metadata de cadastro; promover a admin exige
  um admin autenticado e fica registrado em `audit_logs`.
- O Realtime herda as mesmas policies de `SELECT`: ninguém é notificado de uma
  conversa que não poderia ler.
- O destino pós-login é validado (`lib/safe-redirect.ts`). Checar só se começa
  com `/` deixaria passar `//site-externo.com`, que o navegador trata como
  endereço absoluto — bastaria mandar esse link a um consignador para levá-lo a
  um login falso depois de autenticar de verdade.

### Fluxo de recebimento

```
Meta → assinatura HMAC → idempotência → grava → identifica número
     → identifica/cria conversa → atualiza banco → Realtime → interface
```

- A assinatura é conferida sobre o **corpo cru**; reserializar o JSON
  invalidaria o HMAC.
- Cada evento é reservado em `webhook_events` por `(provider, event_key)`. A
  Meta reentrega quando não recebe 200 rápido, e a segunda entrega cai fora
  sozinha.
- Se o processamento falhar de forma inesperada, a reserva é **liberada** e a
  rota responde 500 — de propósito, para que a Meta reentregue. Sem isso o
  evento se perderia para sempre.
- Status chegam fora de ordem (`read` antes de `delivered`). O status da
  mensagem só avança, nunca regride.

### Fluxo de envio

```
usuário digita → POST /api/messages/send → valida permissão → registra tentativa
              → chama a Meta → salva provider_message_id → webhook atualiza status
```

O navegador nunca fala com a Meta. A tentativa é gravada **antes** da chamada
externa: se a Meta aceitar e o processo cair em seguida, a mensagem não some do
histórico. O `clientRef` gerado no navegador garante que duplo clique ou retry
não vire duas mensagens para o cliente.

### Envio de mídia

O arquivo **não** passa pela rota de API: funções serverless na Vercel aceitam
poucos megabytes por requisição, e foto de celular passa disso. O backend
confere a permissão e emite uma URL assinada; o navegador sobe direto para o
Storage; a Meta busca o arquivo por um link temporário de 10 minutos.

A cópia fica no bucket privado, então o histórico continua legível depois que a
mídia expira do lado da Meta. Tipo e tamanho são validados antes do upload,
com os mesmos limites da Cloud API.

### Gravação de áudio

O Chrome só grava em WebM, contêiner que a Cloud API não aceita — e áudio é
metade da prospecção por WhatsApp no Brasil, então não dava para deixar de fora.

A saída não foi carregar um transcodificador no navegador: WebM/Opus e Ogg/Opus
carregam os **mesmos pacotes Opus**, só mudam a embalagem. O CRM lê os blocos do
WebM e reescreve num contêiner Ogg (`lib/audio/`). Sem recodificar, sem perda de
qualidade, sem dependência nova — e o áudio sai no formato nativo do WhatsApp.

Firefox e Safari já gravam em formato aceito; nesses o remux nem acontece.

### Foto do cliente

A Cloud API da Meta **não** expõe a foto de perfil de um contato: o webhook
entrega `profile.name` e `wa_id`, e o endpoint de perfil existe apenas para o
seu próprio número de negócio. Importar a foto automaticamente exigiria
automação de WhatsApp Web, que está fora de questão.

Então a foto é carregada pelo consignador, no cadastro ou na edição. Mesmo
caminho da mídia das conversas: URL assinada, upload direto do navegador para
um bucket privado, e exibição por rota autenticada — foto de cliente é dado
pessoal e não fica em link público adivinhável.

No cadastro o upload acontece **depois** de criar o cliente, porque antes disso
não há a quem vinculá-la; se falhar, o cadastro continua válido, sem foto.

### Movimento

O vocabulário é curto e vive em `globals.css`: entrada (mensagem, indicador),
surgimento (contador de não lidas), transição de diálogo e recuo no clique dos
botões. Tudo entre 150 e 220 ms.

Movimento aqui confirma que algo chegou ou mudou — numa ferramenta usada o dia
inteiro, animação longa vira espera. E `prefers-reduced-motion` desliga tudo:
não é preferência estética, animação pode causar desconforto vestibular real.

### Regras da Meta são respeitadas, não contornadas

Fora da janela de 24 horas o envio comum é **bloqueado** com explicação na
interface. O único caminho oferecido é o oficial: enviar um template aprovado,
escolhido de uma lista que vem da própria Meta — só aparece o que já passou
por aprovação. Não há automação de WhatsApp Web em lugar nenhum. A arquitetura
está preparada para coexistência (WhatsApp Business App + Cloud API no mesmo
número) através do modo oficial da Meta.

### Fuso horário

A Vercel roda em UTC e o consignador está em Brasília. Se cada camada usasse o
fuso do próprio ambiente, o mesmo instante apareceria de três formas: horário
errado na tela, "Hoje" começando às 21h do dia anterior nas métricas e
divergência de hidratação em todo timestamp renderizado no servidor.

Por isso toda conversão entre instante e "dia/hora" passa por `lib/time.ts`,
com fuso fixo — inclusive o agrupamento por hora do gráfico de volume, feito no
banco com `at time zone`. O banco continua guardando tudo em UTC.

---

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

### Banco

Aplique as migrations de `supabase/migrations/` em ordem, pela CLI do Supabase
(`supabase db push`) ou colando no SQL Editor.

Depois crie o primeiro administrador:

1. crie o usuário em **Authentication · Users** no painel do Supabase;
2. rode `update public.profiles set role = 'admin' where email = '...';`

A partir daí todos os outros usuários são criados pela tela **Equipe**.

### Dados de demonstração

A inbox é o coração do sistema e, vazia, não diz nada sobre a experiência.
Antes de existir integração com a Meta, rode `supabase/seed/demo.sql` no SQL
Editor: ele cria quatro consignadores, dois números (um compartilhado e um
individual), 22 prospects e 77 mensagens distribuídas pelo funil.

Os consignadores entram com a senha `demo4fmotors`. Entrar como um deles é a
forma mais direta de conferir que a RLS funciona: você vê apenas os clientes
daquele vendedor, mesmo sendo o mesmo banco.

Para remover tudo: `supabase/seed/demo_cleanup.sql`. Ele reconhece o que apagar
pelos telefones da faixa `+55 11 9000-00xx` e pelos e-mails
`@demo.4fmotors.local`, então é seguro rodar com dados reais no banco.

O seed não cadastra tokens da Meta — enviar mensagem responde "número sem
credenciais válidas", que é o comportamento correto.

> Desative o signup público em **Authentication · Providers**. O acesso é
> restrito à equipe e todo usuário nasce como consignador.

### Webhook da Meta

No painel da Meta, em WhatsApp · Configuração:

- **URL de callback**: `https://SEU-DOMINIO/api/whatsapp/webhook`
- **Token de verificação**: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
- **Campos**: `messages`

O `META_APP_SECRET` é obrigatório. Sem ele o webhook rejeita tudo — é assim de
propósito, já que o endpoint é público.

Cada número é cadastrado pela tela **WhatsApps**, com o `phone_number_id` e o
token de acesso do painel da Meta.

---

## Verificação

```bash
npm run check       # typecheck + lint + testes
npm run build
npm run db:verify   # migrations, RLS e métricas num Postgres descartável
```

`db:verify` sobe um Postgres temporário, recria o que o Supabase fornece
pronto (`supabase/local/supabase-stub.sql`), aplica todas as migrations e então
**exercita** a segurança em vez de apenas ler as policies: entra como
consignador e confere que ele vê só os clientes dele, que os tokens da Meta são
inacessíveis, que escalonamento de papel e transferência são recusados, e que o
comparativo da equipe só responde ao admin.

Isso vale porque policy, trigger e função de métrica não têm como falhar em
tempo de compilação — só quando executadas.

Os testes cobrem a lógica que quebra silenciosamente em produção: normalização
de telefone brasileiro (o nono dígito que a Meta às vezes omite), conversão de
fuso, verificação de assinatura, parsing de webhook, ordenação de status,
avanço de funil, períodos e buckets de métrica, validação de mídia, variáveis
de template, rate limit e o remux de áudio — este último com round-trip, que
remonta os pacotes a partir do Ogg gerado e confere byte a byte.

---

## Estrutura

```
src/
  app/
    (app)/        inbox · clientes · desempenho · equipe · whatsapps · auditoria
    api/          envio, webhook, mídia e rotas administrativas
    login/
  components/
    inbox/        as três colunas da tela principal
    crm/          status, notas, transferência, cadastro
    admin/        equipe e números
    metrics/      indicadores e ranking
    ui/           primitivos (shadcn)
  lib/
    supabase/     clientes: sessão (RLS), navegador e service_role
    contacts/     foto do cliente: validação, caminho e upload
    whatsapp/     Cloud API, webhook, ingestão, status
    audio/        remux WebM -> Ogg para as gravações do navegador
    data/         consultas e métricas
    domain/       funil de status
supabase/
  migrations/   schema, RLS, guards e métricas
  seed/         dados de demonstração e limpeza
  local/        stub do Supabase para verificação offline
scripts/
  verify-db.sh  aplica as migrations e exercita a RLS
```

---

## Decisões deliberadas

**Filtro da inbox no cliente.** A RLS já entregou só o que o usuário pode ver,
e a lista cabe em memória. Filtrar no navegador é instantâneo e evita uma ida
ao servidor a cada tecla.

**Telefone único por cliente.** Índice único em `contacts.phone_e164`: dois
consignadores não abordam a mesma pessoa, e o roteamento do número
compartilhado fica determinístico.

**Rate limit em memória.** Em serverless o estado é por instância, então o
limite efetivo é maior que o configurado. Para poucos usuários isso já contém
abuso acidental; se o volume crescer, trocar o `Map` por Redis sem mexer na
interface da função.

**Tema escuro apenas.** Os tokens de cor estão isolados em `globals.css`;
adicionar tema claro é redefinir variáveis, sem tocar em componente.

**Gráfico sem biblioteca.** O volume por horário é barra em CSS puro. A
pergunta que ele responde — em que horário a equipe trabalha e onde estão os
buracos — se resolve com altura relativa; eixo, grade e tooltip só somariam
ruído e peso ao bundle.

**Remux em vez de transcodificação.** Trocar o contêiner do áudio custa
~300 linhas testadas; `ffmpeg.wasm` custaria alguns megabytes no bundle e uma
espera visível a cada gravação, para um resultado idêntico.

**Edição em diálogo, não em página.** O mesmo formulário serve a ficha da
inbox e a página do cliente. Ele busca os dados ao abrir em vez de recebê-los
por prop: as duas telas carregam recortes diferentes do registro, e salvar em
cima de um estado parcial apagaria campo que a tela de origem não conhecia.

**Status como ponto colorido nas listas, badge só na ficha.** Onde há muitas
linhas — inbox e lista de clientes —, um badge por linha vira parede de cor e
nada se destaca. O ponto de 6px carrega a mesma informação e deixa o nome do
cliente ser o elemento dominante. Na ficha, onde existe uma única ocorrência, o
badge volta.

**O acento âmbar é raro de propósito.** Ele marca ação primária, seleção e
consignação — o resultado que a operação persegue. Quando passou a cobrir metade
do gráfico de volume, perdeu o significado; hoje as barras usam o tom atenuado e
o âmbar cheio fica para o que precisa ser notado.

---

## O que ficou de fora, de propósito

Chatbot, IA, automações, campanhas, e-mail marketing, ERP, financeiro, estoque,
emissão fiscal, RH, calendário e múltiplos pipelines.

O critério para qualquer feature nova continua sendo: *isso ajuda o consignador
a prospectar e atender, ou o administrador a supervisionar?* Se não, fica de
fora.
