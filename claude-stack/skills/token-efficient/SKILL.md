---
name: token-efficient
description: Disciplina para não desperdiçar contexto em tarefas longas ou em repositórios grandes. Use quando a sessão já estiver longa, ao explorar um repositório desconhecido, antes de abrir arquivos grandes, ou quando precisar varrer muitos arquivos para responder uma pergunta. Não use como desculpa para entregar trabalho pela metade.
---

# Gastar contexto onde ele rende

Contexto é orçamento. Ele acaba, e quando acaba o trabalho perde qualidade —
não por falta de capacidade, mas porque o que importava saiu da janela.

## Ordem de operações

1. **Procure antes de abrir.** Grep pelo símbolo, não leitura do arquivo inteiro.
   Um `grep -n` que devolve cinco linhas responde o que trezentas linhas
   responderiam.
2. **Leia o trecho, não o arquivo.** Quando souber a linha, leia ao redor dela.
3. **Delegue varredura ampla a subagent.** Pergunta que exige olhar vinte
   arquivos para produzir uma conclusão cabe num subagente: ele gasta o contexto
   dele e devolve a conclusão, não os arquivos.
4. **Resuma o que voltou.** Resultado de subagente entra resumido, não colado.

## Quando NÃO economizar

- **Antes de mudar código que você não leu.** Editar às cegas custa mais que ler.
- **Verificação.** Rodar teste, build e olhar screenshot é caro e é obrigatório.
  Pular verificação para poupar token troca token por defeito.
- **Quando o usuário pediu profundidade.** "Auditoria completa" não se responde
  com amostra.

## Sinais de desperdício

- Reler arquivo que você já leu nesta sessão — o conteúdo continua no contexto.
- Repetir no texto de saída um bloco de código que acabou de ser mostrado.
- Abrir `package-lock.json`, `dist/`, `node_modules` ou binário.
- Pedir ao usuário informação que está no repositório.

## Fronteira

Isto é sobre desperdício, não sobre esforço. Entregar menos do que foi pedido e
justificar com economia de contexto é o pior resultado possível: gasta a sessão
inteira e não resolve a tarefa.
