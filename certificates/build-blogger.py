import re
src=open('/home/user/Admob-ANE/certificates/index.html').read()
css=re.search(r'<style>(.*?)</style>',src,re.S).group(1)
body=re.search(r'<body>(.*?)<script>',src,re.S).group(1)
js=re.search(r'<script>(.*?)</script>',src,re.S).group(1)
fonts=re.findall(r'<link[^>]+>',src)
# drop auto dark mode + print block (rewritten below)
css=re.sub(r'@media \(prefers-color-scheme:dark\)\{.*?\n\}\n','',css,flags=re.S)
css=re.sub(r'/\* ===== الطباعة.*','',css,flags=re.S)
P_='.shp'
def pre(sel):
    out=[]
    for s in sel.split(','):
        s=s.strip()
        if s in(':root','body'):out.append(P_)
        elif s==':root[data-theme="dark"]':out.append(P_+'[data-theme="dark"]')
        elif s=='*':out.append(P_+','+P_+' *')
        else:out.append(P_+' '+s)
    return ','.join(out)
def walk(c):
    res='';i=0
    while i<len(c):
        j=c.find('{',i)
        if j<0:res+=c[i:];break
        sel=c[i:j];
        if sel.strip().startswith('/*'):
            k=sel.find('*/');res+=sel[:k+2];sel=sel[k+2:]
        if sel.strip().startswith('@media'):
            depth=1;k=j+1
            while depth:depth+= {'{':1,'}':-1}.get(c[k],0);k+=1
            res+=sel+'{'+walk(c[j+1:k-1])+'}';i=k;continue
        k=c.find('}',j)
        res+=pre(sel)+c[j:k+1] if sel.strip() else c[i:k+1];i=k+1
    return res
css=walk(css)
css+='''
.shp{direction:rtl;text-align:right;font-size:16px;letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;font-style:normal;container-type:inline-size}
@container (max-width:900px){.shp .wrap{grid-template-columns:1fr}}
.shp input,.shp select,.shp textarea{max-width:none;box-shadow:none;margin:0;height:auto;min-height:0;line-height:1.4;box-sizing:border-box}
.shp textarea{min-height:170px}
.shp #header{min-height:70px}
.shp .tgl input{width:auto}
.shp svg{max-width:none!important;max-height:none!important}
.shp .cert>svg.bg,.shp .tpl .th svg{width:100%!important;height:100%!important}
.shp .cert img{border:0!important;box-shadow:none!important;padding:0!important;background:none!important;max-width:none!important}
.shp .cert .sigimg{max-width:52mm!important}
.shp .cert .head img{max-width:40mm!important}
.shp-print{display:none}
@media print{
  @page{size:A4 landscape;margin:0}
  html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important}
  body>*:not(.shp-print){display:none!important}
  .shp-print{display:block!important;background:#fff}
  .shp-print .cert{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .shp-print .cert+.cert{page-break-before:always;break-before:page}
  .shp-print .cert{height:209mm!important}
}'''
body=body.replace('<div id="print"></div>','')
js=js.replace("document.documentElement","$('shahada')")
js=js.replace("const p=$('print');p.innerHTML=list.map(cert).join('');p.style.display='block';fit(p);p.style.display='';",
 "let p=document.querySelector('body>.shp-print');if(!p){p=document.createElement('div');p.className='shp shp-print';document.body.appendChild(p)}p.innerHTML=list.map(cert).join('');p.style.cssText='display:block;position:absolute;left:-99999px';fit(p);p.style.cssText='';")
js=js.replace("$('theme').onclick=()=>{const r=$('shahada');","$('theme').onclick=()=>{const r=$('shahada');")
js=js.replace("addEventListener('resize',scale);","addEventListener('resize',scale);")
def jsesc(t):
    r=[]
    for ch in t:
        o=ord(ch)
        if o<128:r.append(ch)
        elif o>0xFFFF:
            o-=0x10000;r.append('\\u%04x\\u%04x'%(0xD800+(o>>10),0xDC00+(o&0x3FF)))
        else:r.append('\\u%04x'%o)
    return ''.join(r)
js=jsesc(js)
out=f'''<!-- شهادتي: مولّد شهادات التقدير — Kamirty.AI | الصق هذا الكود في صفحة بلوجر بوضع HTML -->
{chr(10).join(fonts)}
<style>{css}</style>
<div class="shp" id="shahada">
{body.strip()}
</div>
<script>
(function(){{{js}}})();
</script>
'''
open('/home/user/Admob-ANE/certificates/blogger-embed.html','w').write(out)
