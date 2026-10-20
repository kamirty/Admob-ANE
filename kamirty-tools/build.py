#!/usr/bin/env python3
"""Build Blogger-ready tools from src/.

Blogger rewrites non-ASCII characters inside <script> and <style> as HTML
entities (e.g. &#1617;), which then show up literally on the page. This
escapes them to \\uXXXX (JS) and \\XXXXXX (CSS) so the output is pure ASCII
inside those blocks. Usage: python3 build.py
"""
import pathlib, re

HERE = pathlib.Path(__file__).parent

def js_escape(code):
    out = []
    for ch in code:
        o = ord(ch)
        if o < 128:
            out.append(ch)
        elif o <= 0xFFFF:
            out.append('\\u%04x' % o)
        else:
            o -= 0x10000
            out.append('\\u%04x\\u%04x' % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return ''.join(out)

def css_escape(code):
    return ''.join(ch if ord(ch) < 128 else '\\%06x' % ord(ch) for ch in code)

def build(src):
    s = src.read_text(encoding='utf-8')
    s = re.sub(r'(<script>)(.*?)(</script>)', lambda m: m.group(1) + js_escape(m.group(2)) + m.group(3), s, flags=re.S)
    s = re.sub(r'(<style>)(.*?)(</style>)', lambda m: m.group(1) + css_escape(m.group(2)) + m.group(3), s, flags=re.S)
    for block in re.findall(r'<(?:script|style)>.*?</(?:script|style)>', s, flags=re.S):
        assert block.isascii()
    out = HERE / src.name
    out.write_text(s, encoding='utf-8')
    print('built', out.name)

for f in sorted((HERE / 'src').glob('*.html')):
    build(f)
