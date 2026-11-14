#!/bin/zsh
set -eu
umask 077
MINGMA_ROOT="${0:A:h}"
MINGMA_NODE=""
for candidate in "$HOME/.local/share/nodejs/current/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [[ -x "$candidate" ]]; then MINGMA_NODE="$candidate"; break; fi
done
if [[ -z "$MINGMA_NODE" ]]; then MINGMA_NODE="$(command -v node || true)"; fi
if [[ -z "$MINGMA_NODE" ]]; then print "需要安装 Node.js 24 或更新版本。"; exit 1; fi
cd "$MINGMA_ROOT"
"$MINGMA_NODE" "$MINGMA_ROOT/scripts/local-deploy.mjs" lan-on
