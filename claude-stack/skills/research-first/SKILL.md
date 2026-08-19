---
name: research-first
description: Consulte a documentação atual antes de escrever código contra uma API, biblioteca ou framework externo. Use quando a tarefa depender de assinatura de função, formato de payload, limite de plano, nome de campo, versão de SDK ou comportamento de serviço de terceiros — especialmente APIs que mudam rápido (Meta, Stripe, OpenAI, Supabase, Vercel, AWS) ou libs que tiveram major recente.
---

# Pesquisar antes de assumir

Conhecimento de treino envelhece. Uma assinatura lembrada com confiança é
indistinguível de uma correta até o código rodar — e o custo do erro não é o
tempo de escrever, é o tempo de descobrir por que não funciona.

## Quando usar

- A tarefa cita API externa, SDK, serviço em nuvem ou biblioteca.
- Você está prestes a escrever nome de campo, endpoint, parâmetro ou header de memória.
- O usuário relata que algo "parou de funcionar" sem ter mudado o código.
- A biblioteca teve major version recente, ou você não sabe qual versão o projeto usa.

## Quando NÃO usar

- Linguagem, algoritmo ou lógica de negócio do próprio projeto — nada disso muda por fora.
- API interna do repositório: leia o código, é a fonte da verdade.
- Você já verificou nesta sessão. Não repita a consulta.

## Como

1. **Descubra a versão real** antes de qualquer coisa: `package.json`,
   lockfile, `requirements.txt`, `go.mod`. Documentação da versão errada é pior
   que nenhuma.
2. **Prefira a fonte primária** — docs oficiais e changelog — a blog e resposta
   de fórum, que envelhecem sem aviso.
3. **Cheque o changelog** entre a versão do projeto e a da documentação quando
   houver salto de major.
4. **Cite o que encontrou** ao escrever o código: qual versão, qual página.
   Quem revisar precisa poder conferir.

## O que registrar

Ao terminar, diga em uma linha o que você verificou e o que **não** conseguiu
verificar. "Confirmei o formato do webhook na doc v21; não achei o limite de
tamanho de mídia" é útil. Silêncio sobre a lacuna não é.
