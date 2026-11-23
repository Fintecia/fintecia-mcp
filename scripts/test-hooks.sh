#!/usr/bin/env bash
# Tests de los hooks de delivery (.githooks/commit-msg, .githooks/pre-push y .githooks/pre-commit).
# Afirma los casos de aceptación y rechazo de cada hook.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS="$ROOT/.githooks"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

assert_reject() { # $1 = descripción (el hook ya se corrió contra "$TMP/msg" o stdin)
  local rc=$?
  if [ "$rc" -ne 0 ]; then echo "  ✅ $1"; pass=$((pass+1)); else echo "  ❌ $1 (esperaba rechazo)"; fail=$((fail+1)); fi
}
assert_accept() {
  local rc=$?
  if [ "$rc" -eq 0 ]; then echo "  ✅ $1"; pass=$((pass+1)); else echo "  ❌ $1 (esperaba aceptar)"; fail=$((fail+1)); fi
}

echo "commit-msg:"
printf 'fix: algo\n\nCo-Authored-By: Claude <c@example.com>\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "Co-Authored-By rechazado"

printf 'feat(x): ok\n\nGenerated with Claude\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "atribución IA rechazada"

printf 'feat(x): ok\n\n🤖\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "emoji robot rechazado"

printf 'agregué un fix rápido\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "subject sin Conventional Commits rechazado"

printf 'feat(hooks): enforce no AI attribution\n\nCuerpo.\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "Conventional Commits válido aceptado"

printf 'Merge branch x into y\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject Merge aceptado"

printf 'Revert "feat(x): revierte algo"\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject Revert git-generado aceptado"

printf 'Reverted the session timeout change\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "subject 'Reverted...' no es exención (bypass)"

printf 'Amended docs for hooks\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "subject 'Amended...' no es exención (bypass)"

printf 'Merge conflicts in login\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "subject 'Merge conflicts...' no es exención (bypass)"

printf 'Revert logic for retries\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "subject 'Revert logic...' no es exención (bypass)"

printf "Merge branch 'feat/x' into 'main'\n" > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Merge branch ...' git-generado aceptado"

printf "Merge branches 'a', 'b' and 'c'\n" > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Merge branches ...' octopus git-generado aceptado"

printf "Merge remote-tracking branches 'origin/a', 'origin/b'\n" > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Merge remote-tracking branches ...' git-generado aceptado"

printf "Merge commit 'abc123'\n" > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Merge commit ...' git-generado aceptado"

printf 'Merge pull request #123 from org/feat\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Merge pull request #...' git-generado aceptado"

printf 'Squashed commit of the following:\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'Squashed commit of the following:' aceptado"

printf 'chore(release): v1.2.0\n' > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_accept "subject 'chore(release):' aceptado"

# Mensaje largo con atribución al final (edge case pipefail).
{ for i in $(seq 1 2000); do echo "línea $i"; done; echo; echo "Co-Authored-By: Copilot <x@y>"; } > "$TMP/msg"
"$HOOKS/commit-msg" "$TMP/msg" >/dev/null 2>&1; assert_reject "mensaje largo con atribución rechazado"

echo "pre-push:"
printf 'refs/heads/main abc refs/heads/main abc\n' > "$TMP/push"
"$HOOKS/pre-push" < "$TMP/push" >/dev/null 2>&1; assert_reject "push a main (origen) rechazado"

printf 'refs/heads/feat/x abc refs/heads/main abc\n' > "$TMP/push"
"$HOOKS/pre-push" < "$TMP/push" >/dev/null 2>&1; assert_reject "push feature->main (refspec) rechazado"

printf 'refs/heads/feat/x abc refs/heads/feat/x abc\n' > "$TMP/push"
"$HOOKS/pre-push" < "$TMP/push" >/dev/null 2>&1; assert_accept "push feature->feature aceptado"

echo "pre-commit (session lease):"
# El hook pre-commit resuelve el git-dir según el cwd, así que corre contra
# un repo temporal. Cada caso aísla el lease con un repo propio.
run_precommit() { # $1 = OPENCODE_SESSION_ID (vacío = unset), $2 = ruta al repo
  if [ -n "$1" ]; then
    OPENCODE_SESSION_ID="$1" "$HOOKS/pre-commit" >/dev/null 2>&1
  else
    env -u OPENCODE_SESSION_ID "$HOOKS/pre-commit" >/dev/null 2>&1
  fi
}

PCREPO_A="$(mktemp -d)"
git -C "$PCREPO_A" init -q
(cd "$PCREPO_A" && run_precommit "" "$PCREPO_A"); assert_accept "sin OPENCODE_SESSION_ID → no-op (acepta)"

PCREPO_B="$(mktemp -d)"
git -C "$PCREPO_B" init -q
(cd "$PCREPO_B" && run_precommit "ses-a" "$PCREPO_B"); assert_accept "primer commit → claim + acepta"
[ -f "$PCREPO_B/.git/session-lease" ]; assert_accept "lease escrito en el git-dir"
[ "$(cat "$PCREPO_B/.git/session-lease")" = "ses-a" ]; assert_accept "lease contiene el OPENCODE_SESSION_ID"

(cd "$PCREPO_B" && run_precommit "ses-a" "$PCREPO_B"); assert_accept "misma sesión → acepta"

(cd "$PCREPO_B" && run_precommit "ses-b" "$PCREPO_B"); assert_reject "otra sesión → rechaza"
[ "$(cat "$PCREPO_B/.git/session-lease")" = "ses-a" ]; assert_accept "reject no pisa el lease (sigue ses-a)"

# session-lease.sh status + subcomando inválido.
(cd "$PCREPO_B" && "$ROOT/scripts/session-lease.sh" status 2>&1 | grep -q "ses-a"); assert_accept "status muestra el lease"
(cd "$PCREPO_B" && "$ROOT/scripts/session-lease.sh" bogus >/dev/null 2>&1); assert_reject "subcomando inválido → exit != 0"

# release manual limpia el lease y permite re-claim.
(cd "$PCREPO_B" && "$ROOT/scripts/session-lease.sh" release >/dev/null 2>&1); assert_accept "session-lease.sh release limpia el lease"
[ ! -f "$PCREPO_B/.git/session-lease" ]; assert_accept "lease removido tras release"
(cd "$PCREPO_B" && run_precommit "ses-c" "$PCREPO_B"); assert_accept "re-claim tras release acepta"

rm -rf "$PCREPO_A" "$PCREPO_B"

echo
echo "Resultado: $pass pasaron, $fail fallaron"
[ "$fail" -eq 0 ]
