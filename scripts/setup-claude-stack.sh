#!/usr/bin/env bash
# =============================================================================
# Stack de Skills/Plugins para Claude Code
# =============================================================================
# Cada comando abaixo foi EXECUTADO e verificado num ambiente limpo com
# Claude Code 2.1.235 antes de entrar neste arquivo. Nada aqui é sugestão.
#
# Uso:  bash setup-claude-stack.sh
# Requer: claude (>= 2.1), git, npm.
#
# Não usa sudo. Não pede token, chave nem credencial. Instala no escopo do
# usuário (~/.claude), sem tocar em configuração de projeto.
# =============================================================================
set -euo pipefail

echo "→ Claude Code: $(claude --version)"

add_marketplace() {
  # Idempotente: se já existir, o comando falha e seguimos em frente.
  claude plugin marketplace add "$1" >/dev/null 2>&1 \
    && echo "   marketplace + $1" \
    || echo "   marketplace = $1 (já existia)"
}

install() {
  if claude plugin list 2>/dev/null | grep -q "> ${1%@*}@"; then
    echo "   plugin     = $1 (já instalado)"
  else
    claude plugin install "$1" >/dev/null 2>&1 \
      && echo "   plugin     + $1" \
      || echo "   plugin     ! $1 (falhou)"
  fi
}

# --- 1. Superpowers ----------------------------------------------------------
# Jesse Vincent (obra), MIT. Biblioteca central: TDD, depuração, colaboração.
echo "→ Superpowers"
add_marketplace obra/superpowers
install superpowers@superpowers-dev

# --- 2. Skills oficiais da Anthropic ----------------------------------------
# Um único plugin traz skill-creator, frontend-design, webapp-testing,
# web-artifacts-builder, mcp-builder e outras.
echo "→ Anthropic (example-skills)"
add_marketplace anthropics/skills
install example-skills@anthropic-agent-skills

# --- 3. Trail of Bits — segurança -------------------------------------------
# As sete pedidas existem todas no repositório oficial.
echo "→ Trail of Bits"
add_marketplace trailofbits/skills
for s in audit-context-building differential-review insecure-defaults \
         static-analysis property-based-testing sharp-edges variant-analysis; do
  install "$s@trailofbits"
done

# --- 4. Supabase / PostgreSQL ------------------------------------------------
echo "→ Supabase"
add_marketplace supabase/agent-skills
install postgres-best-practices@supabase-agent-skills
install supabase@supabase-agent-skills

# --- 5. Sentry ---------------------------------------------------------------
echo "→ Sentry"
add_marketplace getsentry/sentry-skills
install sentry-skills@sentry-skills

# --- 6. UI/UX Pro Max --------------------------------------------------------
# COMUNIDADE, não oficial (nextlevelbuilder). Complementa frontend-design,
# não a substitui — as duas convivem.
echo "→ UI/UX Pro Max (comunidade)"
add_marketplace nextlevelbuilder/ui-ux-pro-max-skill
install ui-ux-pro-max@ui-ux-pro-max-skill

# --- 7. Planning with Files --------------------------------------------------
# COMUNIDADE (OthmanAdi). task_plan.md / findings.md / progress.md em disco,
# para o plano sobreviver a /clear e compactação.
echo "→ Planning with Files (comunidade)"
add_marketplace OthmanAdi/planning-with-files
install planning-with-files@planning-with-files

# --- 8. gstack ---------------------------------------------------------------
# Garry Tan. NÃO é marketplace: instala por clone em ~/.claude/skills/.
# O ./setup do projeto baixa bun e Chromium (2296 linhas) e só é necessário
# para as skills de navegador (/browse, /qa). Sem ele, os workflows de
# planejamento e revisão já funcionam.
echo "→ gstack"
if [ -d "$HOME/.claude/skills/gstack" ]; then
  echo "   gstack     = já existe (atualize com: git -C ~/.claude/skills/gstack pull)"
else
  git clone --single-branch --depth 1 -q \
    https://github.com/garrytan/gstack.git "$HOME/.claude/skills/gstack"
  echo "   gstack     + clonado ($(find "$HOME/.claude/skills/gstack" -maxdepth 2 -name SKILL.md | wc -l) skills)"
  echo "   para as skills de navegador (/browse, /qa), rode depois:"
  echo "     cd ~/.claude/skills/gstack && ./setup"
fi

# --- 9. Skills e subagentes próprios ----------------------------------------
# Ficam versionados em claude-stack/ e são copiados para ~/.claude/.
# Só existem porque nada instalado acima cobria: pesquisar doc antes de assumir
# API, refatorar sem mudar comportamento, disciplina de contexto e medir antes
# de otimizar. O resto do que se costuma pedir já vem em Superpowers/gstack.
echo "→ Skills e subagentes próprios"
STACK_DIR="$(cd "$(dirname "$0")/.." && pwd)/claude-stack"

if [ -d "$STACK_DIR" ]; then
  # Backup antes de sobrescrever qualquer coisa que já exista.
  if [ -d "$HOME/.claude/agents" ] || [ -d "$HOME/.claude/skills" ]; then
    BACKUP="$HOME/.claude/backups/pre-stack-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP"
    cp -r "$HOME/.claude/agents" "$BACKUP/" 2>/dev/null || true
    cp -r "$HOME/.claude/skills" "$BACKUP/" 2>/dev/null || true
    echo "   backup     → $BACKUP"
  fi

  mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents"
  cp -r "$STACK_DIR/skills/." "$HOME/.claude/skills/"
  cp "$STACK_DIR/agents/"*.md "$HOME/.claude/agents/"
  echo "   skills     + $(ls "$STACK_DIR/skills" | tr '\n' ' ')"
  echo "   agents     + $(ls "$STACK_DIR/agents" | sed 's/.md//' | tr '\n' ' ')"
else
  echo "   ! claude-stack/ não encontrado — rode este script de dentro do repositório"
fi

echo
echo "→ Instalado:"
claude plugin list 2>/dev/null | grep "^  >" || true
echo
echo "Reinicie o Claude Code: skills entram na hora, subagentes precisam do restart."
