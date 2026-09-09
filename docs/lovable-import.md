# Reimportação da Inbox no Lovable

Este repositório usa Next.js. O projeto **Connect My Code**, na workspace
**TRABALHO** do Lovable, usa TanStack Start e recebe adaptações manuais deste
código. Uma publicação no Lovable não atualiza automaticamente este repositório.

Ao reimportar as melhorias da Inbox:

- Preserve as rotas e a autenticação do projeto de destino. No Next.js, as
  chamadas usam `fetch` e a sessão em cookies. No Lovable, as chamadas às APIs
  protegidas usam o adaptador `apiFetch` do projeto.
- Imagens, vídeos e áudios continuam passando pela rota autenticada de mídia.
  As URLs `blob:` usadas na tela são temporárias e devem ser revogadas.
- Importe juntos os componentes da Inbox e os utilitários em `src/lib/inbox`.
  Rascunhos contêm apenas texto e são separados por usuário e conversa.
- Preserve a paginação por `(created_at, id)`, a mesclagem por ID e a
  atualização em tempo real das mensagens já carregadas.
- Mantenha a validação de arquivos, a compressão existente, o limite de dez
  anexos e a janela de atendimento. Colar ou arrastar um arquivo apenas o anexa.

Antes de publicar, rode tipos, lint, testes e build no projeto de destino.
Confira também a Inbox no desktop e no celular com respostas de API simuladas:
envio lento ou com falha, troca de conversa, rascunho após recarga, excesso de
anexos, histórico com mídia carregando e navegação de fotos pelo teclado.
Os testes de envio não devem atingir clientes reais.
