# شهادتي — مولّد شهادات التقدير (Kamirty.AI)

صفحة واحدة ثابتة (`index.html`) بلا خادم ولا قاعدة بيانات، تعمل في متصفح المستخدم. فيها زر «العودة إلى Kamirty.AI».

## النشر على shahada.kamirtyai.com (الموقع الرئيسي على Squarespace)
Squarespace لا يستضيف ملفات HTML مستقلة على نطاق فرعي، لذلك تُستضاف الصفحة مجانًا على GitHub Pages ويوجَّه إليها النطاق الفرعي:

1. أنشئ مستودعًا عامًا جديدًا على GitHub (مثلًا `shahada`) وارفع `index.html` إلى جذره.
2. Settings ← Pages ← Source: `main` / root، وفي Custom domain اكتب `shahada.kamirtyai.com`.
3. في Squarespace: Settings ← Domains ← kamirtyai.com ← DNS ← Add record:
   - Type: `CNAME` · Host: `shahada` · Data: `<اسم-حسابك>.github.io`
4. بعد دقائق إلى ساعات فعّل Enforce HTTPS في GitHub Pages.
5. في صفحة Squarespace الرئيسية أضف زرًا أو رابطًا إلى `https://shahada.kamirtyai.com/`.
