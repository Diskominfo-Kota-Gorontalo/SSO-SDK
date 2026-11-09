#!/usr/bin/env bash
# Memastikan tag rilis cocok dengan versi paket sebelum apa pun diterbitkan.
#   - packages/node/package.json harus berversi sama dengan tag.
#   - Paket Laravel dan CodeIgniter 4 harus meminta gorontalokota/sso-php versi yang mencakup tag ini
#     (0.x: "^0.MINOR", 1.x ke atas: "^MAJOR"), agar tidak terpasang dengan inti versi lama.
set -euo pipefail

tag="${1:?Pemakaian: check-versions.sh vX.Y.Z}"
version="${tag#v}"
IFS=. read -r major minor _ <<< "${version}"
status=0

node_version="$(node -p "require('./packages/node/package.json').version")"
if [[ "${node_version}" != "${version}" ]]; then
  echo "::error file=packages/node/package.json::Versi npm ${node_version} tidak sama dengan tag ${tag}."
  status=1
fi

if [[ "${major}" == "0" ]]; then expected="^0.${minor}"; else expected="^${major}"; fi

for package in laravel codeigniter4; do
  file="packages/${package}/composer.json"
  constraint="$(php -r "echo json_decode(file_get_contents('${file}'), true)['require']['gorontalokota/sso-php'] ?? '';")"
  local_version="$(php -r "foreach (json_decode(file_get_contents('${file}'), true)['repositories'] ?? [] as \$r) { if ((\$r['url'] ?? '') === '../php-core') { echo \$r['options']['versions']['gorontalokota/sso-php'] ?? ''; } }")"
  if [[ "${constraint}" != "${expected}" ]]; then
    echo "::error file=${file}::gorontalokota/sso-php diminta \"${constraint}\", seharusnya \"${expected}\" untuk rilis ${tag}."
    status=1
  fi
  if [[ "${local_version}" != "${version}" ]]; then
    echo "::error file=${file}::Versi path repository ../php-core \"${local_version}\" harus \"${version}\" (CI memakai inti dari monorepo)."
    status=1
  fi
done

[[ "${status}" == "0" ]] || echo "Perbaiki sekaligus dengan: .github/scripts/bump-version.sh ${version}"

[[ "${status}" == "0" ]] && echo "Versi cocok untuk ${tag}."
exit "${status}"
