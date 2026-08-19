# 4FMOTORS CRM

CRM interno de uma loja de consignação de veículos. WhatsApp + clientes +
produtividade. Nada além disso.

## Comandos

```
npm run check       # typecheck + lint + testes (rode antes de commitar)
npm run db:verify   # migrations e RLS num Postgres descartável
npm run dev         # servidor local
```

`db:verify` precisa de um usuário sem privilégio de root: `su pgtest -c "./scripts/verify-db.sh"`.

## Regras que não mudam

**A autorização vive no banco.** RLS, triggers de guarda e funções `security
definer`. Proteção só no frontend não conta como proteção. Toda mudança em
policy passa por `npm run db:verify`.

**Segredo nenhum no cliente.** `SUPABASE_SERVICE_ROLE_KEY` e os tokens da Meta
só no servidor, nunca com prefixo `NEXT_PUBLIC_`. Os tokens de cada número
ficam em `whatsapp_account_secrets`, tabela sem policy de leitura.

**Só API oficial da Meta.** Nada de automação de WhatsApp Web, nada de
contornar limite ou política anti-spam da plataforma.

**Fuso fixo.** Toda conversão entre instante e dia/hora passa por `lib/time.ts`
(`America/Sao_Paulo`). O servidor roda em UTC; ler o fuso do ambiente produz
métrica errada e divergência de hidratação.

**Tipos de linha do banco são `type`, nunca `interface`.** O `GenericSchema` do
supabase-js exige assinatura de índice implícita; com `interface` toda consulta
vira `never`.

## Escopo

Não implementar: chatbot, IA, automação complexa, e-mail marketing, campanhas,
ERP, financeiro, estoque completo, fiscal, RH, agenda complexa, múltiplos
pipelines.

## Design

Tema escuro, um único acento âmbar, densidade de informação organizada.
Evitar excesso de gradiente, animação, sombra, card e elemento decorativo.
Movimento só onde confirma que algo chegou, entrou ou mudou.

## Verificação

Interface não se considera pronta porque apareceu na tela. O que typecheck e
teste não pegam — gráfico vazio, divergência de hidratação, texto cortado —
só aparece em screenshot. Suba o servidor e olhe antes de dizer que terminou.
