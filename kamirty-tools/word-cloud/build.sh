#!/usr/bin/env bash
# يبني نسخة بلوجر من word-cloud.html:
#  - سطر واحد بلا تعليقات (حتى لا يُدخل محرر بلوجر وسوم <br> داخل الكود)
#  - السكربت مرمَّز Base64 فلا يحتوي على < أو > أو & التي قد يحوّلها المحرر
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
awk '/^\/\/<!\[CDATA\[/{f=1;next} /^\/\/\]\]>/{f=0;next} f' word-cloud.html > "$TMP/app.js"
sed '/^<script>$/,/^<\/script>$/d' word-cloud.html > "$TMP/page.html"
npx --yes terser@5.31.0 "$TMP/app.js" -c -m --comments false -o "$TMP/app.min.js"
npx --yes html-minifier-terser@7.2.0 --collapse-whitespace --remove-comments --minify-css true \
  -o "$TMP/page.min.html" "$TMP/page.html"
B64=$(node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1]).toString("base64"))' "$TMP/app.min.js")
{
  cat "$TMP/page.min.html"
  printf '<script>(function(){try{new Function(decodeURIComponent(escape(atob("%s"))))()}catch(e){var b=document.querySelector("#kwc .kwc-boot");if(b){b.textContent="⚠ خطأ في تشغيل الأداة: "+e.message;b.style.animation="none";b.style.opacity="1"}}})()</script>\n' "$B64"
} > word-cloud.blogger.html
echo "lines: $(wc -l < word-cloud.blogger.html), bytes: $(wc -c < word-cloud.blogger.html)"
