#!/usr/bin/env bash
# Menaikkan versi semua paket sekaligus:  .github/scripts/bump-version.sh 0.2.0
#   - packages/node/package.json → version
#   - packages/{laravel,codeigniter4}/composer.json → batas gorontalokota/sso-php (0.x: ^0.MINOR, 1.x+: ^MAJOR)
#     dan versi path repository lokal ../php-core (agar CI memakai inti dari monorepo)
set -euo pipefail

version="${1:?Pemakaian: bump-version.sh X.Y.Z}"
version="${version#v}"
[[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Versi harus berformat X.Y.Z" >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"

(cd "${root}/packages/node" && npm version "${version}" --no-git-tag-version --allow-same-version >/dev/null)

for package in laravel codeigniter4; do
  php -r '
    [$file, $version] = [$argv[1], $argv[2]];
    [$major, $minor] = explode(".", $version);
    $json = json_decode(file_get_contents($file), true);
    $json["require"]["gorontalokota/sso-php"] = $major === "0" ? "^0.$minor" : "^$major";
    foreach ($json["repositories"] ?? [] as $i => $repository) {
        if (($repository["url"] ?? null) === "../php-core") {
            $json["repositories"][$i]["options"]["versions"]["gorontalokota/sso-php"] = $version;
        }
    }
    file_put_contents($file, json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
  ' "${root}/packages/${package}/composer.json" "${version}"
done

echo "Versi dinaikkan ke ${version}. Periksa: .github/scripts/check-versions.sh v${version}"
