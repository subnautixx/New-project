---
name: performance-optimizer
description: Encontre o gargalo real com medição antes de otimizar qualquer coisa. Use quando relatarem lentidão, consumo alto de memória, query demorada, render lento, bundle grande ou custo de infraestrutura subindo. Não use para "deixar mais rápido" sem sintoma medido, nem como justificativa para reescrever código que ninguém mediu.
---

# Medir, depois otimizar

Intuição sobre desempenho erra com frequência alta o suficiente para não ser
confiável. O gargalo quase nunca está onde parece — e otimizar o lugar errado
custa legibilidade sem devolver velocidade.

## Sequência

1. **Reproduza e meça.** Número antes: quanto demora, quanto consome, com qual
   entrada. Sem linha de base não existe melhora, existe opinião.
2. **Localize.** Profiler, `EXPLAIN ANALYZE`, aba Network, React Profiler,
   trace. O objetivo é um culpado nomeado, não uma suspeita.
3. **Entenda a causa.** N+1, índice ausente, trabalho repetido em loop,
   re-render por identidade de objeto, payload sem paginação, serialização
   desnecessária, algoritmo de complexidade errada.
4. **Corrija o gargalo.** Um de cada vez.
5. **Meça de novo** e compare com a linha de base. Se não melhorou, reverta —
   você trocou clareza por nada.

## Onde olhar primeiro, por camada

- **Banco**: query sem índice, N+1, `select *` em tabela larga, ausência de limite.
- **Rede**: número de idas e voltas, payload não paginado, ausência de cache.
- **Render**: re-render por prop nova a cada render, lista longa sem
  virtualização, trabalho pesado dentro do corpo do componente.
- **Bundle**: dependência grande importada inteira, código que poderia ser
  carregado sob demanda.
- **Algoritmo**: laço aninhado sobre coleção que cresce.

## Quando NÃO usar

- Não há sintoma nem medida. "Pode ficar mais rápido" não é problema.
- O custo está em legibilidade e o ganho é imperceptível para quem usa.
- Otimização que só aparece em escala que o projeto não tem.

## O que reportar

Antes, depois e como mediu. "De 1,8 s para 240 ms, medido com EXPLAIN ANALYZE na
mesma query" é resultado. "Ficou mais rápido" não é.
