#!/bin/sh
set -eu

project=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temporary=
cleanup() {
  stty echo 2>/dev/null || true
  if [ -n "$temporary" ] && [ -f "$temporary" ]; then
    rm "$temporary"
  fi
}
trap cleanup EXIT HUP INT TERM

printf 'Nueva contraseña administrativa: ' >&2
stty -echo
IFS= read -r password
stty echo
printf '\nRepite la contraseña: ' >&2
stty -echo
IFS= read -r confirmation
stty echo
printf '\n' >&2

if [ "$password" != "$confirmation" ]; then
  printf '%s\n' 'Las contraseñas no coinciden.' >&2
  exit 1
fi
if [ "${#password}" -lt 12 ] || [ "${#password}" -gt 128 ]; then
  printf '%s\n' 'La contraseña debe tener entre 12 y 128 caracteres.' >&2
  exit 1
fi

hash=$(printf '%s' "$password" | docker run --rm -i --entrypoint node eleven-force:local -e 'const {randomBytes,scryptSync}=require("node:crypto");const chunks=[];process.stdin.on("data",chunk=>chunks.push(chunk));process.stdin.on("end",()=>{const value=Buffer.concat(chunks).toString("utf8");if(value.length<12||value.length>128)process.exit(2);const salt=randomBytes(16);process.stdout.write(`${salt.toString("hex")}:${scryptSync(value,salt,32).toString("hex")}`)})')
unset password confirmation
umask 077
temporary=$(mktemp "$project/.env.XXXXXX")
if [ -f "$project/.env" ]; then
  sed '/^ADMIN_PASSWORD_HASH=/d' "$project/.env" > "$temporary"
fi
printf 'ADMIN_PASSWORD_HASH=%s\n' "$hash" >> "$temporary"
mv "$temporary" "$project/.env"
temporary=
cd "$project"
docker compose up -d --force-recreate
printf '%s\n' 'Contraseña actualizada y panel reiniciado.'
