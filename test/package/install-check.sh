#!/usr/bin/env bash
# Installs the packed tarball into a scratch project and loads sections through it as ESM and as CommonJS.
# Usage: install-check.sh <directory holding the .tgz> <cosmiconfig major> <scratch directory>
set -euo pipefail

pack_dir=$1
cosmiconfig_major=$2
scratch=$3
here=$(cd "$(dirname "$0")" && pwd)
# The zod the repository itself tests with, so the consumer check does not drift with zod releases.
zod_version=$(node -p "require(process.argv[1]).devDependencies.zod" "$here/../../package.json")

mkdir -p "$scratch"
cd "$scratch"
npm init -y > /dev/null
npm install "$pack_dir"/*.tgz "cosmiconfig@$cosmiconfig_major" "zod@$zod_version"

cp "$here/check.mjs" "$here/check.cjs" .
# The file is evaluated, not type-checked: it imports the installed package as an authoring file does, and defines a section no tool owns.
cat > exadev.config.ts <<'CONFIG'
import { layoutSection, withSections } from '@exadev/config';

const define = withSections(layoutSection);

export default { ...define({ layout: { groups: [{ name: 'core', rank: 0 }] } }), toolA: { include: ['src'] }, typo: {} };
CONFIG

node check.mjs
node check.cjs
