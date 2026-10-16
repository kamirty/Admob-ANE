#!/usr/bin/env python3
"""Build a Blogger-safe single-line copy of a Kamirty tool.

Blogger's editor can insert <br> on new lines and escape characters inside
inline scripts, which breaks them. The output keeps the HTML/CSS on one line
and ships the script as base64 decoded at runtime, so nothing in it can be
rewritten by the editor.
"""
import base64, re, sys

src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
i, j = s.index('<script>'), s.index('</script>')
head, js, tail = s[:i], s[i + len('<script>'):j], s[j + len('</script>'):]

def flat(h):
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
    h = re.sub(r'\s*\n\s*', ' ', h)
    return re.sub(r'>\s+<', '><', h).strip()

b64 = base64.b64encode(js.encode('utf-8')).decode('ascii')
loader = ('<script>(function(){try{var c=decodeURIComponent(escape(atob("' + b64 + '")));'
          '(0,eval)(c)}catch(e){var r=document.getElementById("kwb2");'
          'if(r){var d=document.createElement("div");d.style.cssText="background:#5a1d1d;color:#fff;padding:10px;border-radius:8px;margin:8px 0;direction:rtl";'
          'd.textContent="تعذّر تشغيل الأداة: "+(e.message||e);r.insertBefore(d,r.firstChild)}}})();</script>')
res = flat(head) + loader + flat(tail)
open(out, 'w', encoding='utf-8').write(res + '\n')
print(out, len(res), 'bytes')
