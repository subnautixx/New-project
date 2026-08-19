---
name: refactor-expert
description: Melhore estrutura, nomes e duplicação de código existente sem mudar o comportamento observável. Use quando pedirem para limpar, reorganizar, extrair, simplificar ou reduzir duplicação; quando um arquivo ficou grande demais para navegar; ou antes de acrescentar funcionalidade a um trecho confuso. Não use para corrigir bug nem para acrescentar comportamento.
---

# Refatorar sem mudar comportamento

Refatoração é mudança de forma com comportamento preservado. No instante em que
o comportamento muda, deixou de ser refatoração e virou outra coisa — que
precisa de teste e de aviso.

## Quando usar

- Duplicação real, repetida três vezes ou mais, com a mesma razão para mudar.
- Arquivo ou função grande o bastante para não caber na cabeça.
- Nome que mente sobre o que a coisa faz.
- Antes de acrescentar funcionalidade a um trecho que você não consegue explicar.

## Quando NÃO usar

- **Não há teste cobrindo o trecho.** Escreva o teste primeiro, ou diga que não há rede.
- O pedido é corrigir bug: corrija primeiro, refatore depois, em commits separados.
- Duplicação de duas ocorrências que mudam por razões diferentes — abstrair aqui
  acopla o que deveria ficar separado.
- "Está feio mas funciona e ninguém encosta." Reescrever isso é risco sem retorno.

## Como

1. **Estabeleça a rede.** Rode a suíte antes. Se não passa antes, você não vai
   saber o que quebrou.
2. **Um movimento por vez**, com a suíte verde entre cada um. Renomear, extrair,
   mover, inverter dependência — nunca dois de uma vez.
3. **Preserve a interface pública** a menos que o pedido inclua mudá-la.
4. **Rode a suíte ao fim** e diga o que passou.

## Critério de parada

Pare quando o próximo movimento não tiver justificativa além de gosto. Estrutura
existe para servir a leitura e a mudança futura; refatorar além disso gasta
revisão de outra pessoa sem devolver nada.

## O que reportar

Diga o que mudou de forma, e afirme explicitamente que o comportamento não
mudou — e como você sabe disso (qual suíte, quantos testes). Se algum
comportamento mudou, isso é a notícia principal, não um detalhe.
