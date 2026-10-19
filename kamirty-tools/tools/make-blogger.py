"""يحوّل ملف الأداة إلى نسخة آمنة للصق في بلوجر:
سطر واحد بلا فواصل أسطر، والسكربت مشفّر base64 فلا يحتوي على < أو & أو أسطر جديدة."""
import base64, re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
i, j = s.index('<script>'), s.index('</script>')
html, js = s[:i], s[i+8:j]
js = js.replace('//<![CDATA[', '').replace('//]]>', '')
html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
html = re.sub(r'>\s+<', '><', html)          # إزالة الفراغات بين الوسوم
html = re.sub(r'\s*\n\s*', ' ', html).strip()  # لا أسطر جديدة إطلاقًا
b64 = base64.b64encode(js.encode('utf-8')).decode()
loader = ('<script>(function(){var s="' + b64 + '";'
          'var t=new TextDecoder().decode(Uint8Array.from(atob(s),function(c){return c.charCodeAt(0)}));'
          'new Function(t)();})();</script>')
assert '<' not in loader[8:-9] and '&' not in loader and '\n' not in loader
open(out, 'w', encoding='utf-8').write(html + loader)
print(out, len(html + loader), 'bytes')
