#!/usr/bin/env bash
# يبني نسخة بلوجر: سطر واحد بلا تعليقات، حتى لا يُدخل محرر بلوجر وسوم <br> داخل السكربت فيتعطل.
set -euo pipefail
cd "$(dirname "$0")"
npx --yes html-minifier-terser@7.2.0 \
  --collapse-whitespace --remove-comments \
  --minify-css true --minify-js '{"format":{"comments":false}}' \
  -o word-cloud.blogger.html word-cloud.html
printf '\n' >> word-cloud.blogger.html
echo "lines: $(wc -l < word-cloud.blogger.html), bytes: $(wc -c < word-cloud.blogger.html)"
