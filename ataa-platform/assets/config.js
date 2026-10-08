/* =====================================================================
   إعدادات المنصة — هذا هو الملف الوحيد الذي تحتاج تعديله.
   ===================================================================== */
window.APP_CONFIG = {
  // اسم المنصة ووصفها القصير
  SITE_NAME: 'منصة عطاء',
  SITE_TAGLINE: 'حصص مجانية مباشرة يقدّمها معلمون متطوعون',

  // من Supabase → Project Settings → API (اتركهما فارغين لتشغيل الوضع التجريبي)
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // بريد أو رقم للتواصل مع إدارة المنصة (اختياري، يظهر في صفحة "عن المنصة")
  CONTACT: '',

  // طريقة عرض الأرقام والتواريخ (latn = أرقام 1 2 3، احذفها لأرقام ١ ٢ ٣)
  LOCALE: 'ar-IQ-u-nu-latn',

  // كم يوماً قادماً يظهر في جدول الطالب
  DAYS_AHEAD: 14,
  // قبل كم دقيقة من بداية الحصة يصبح زر الدخول فعّالاً
  JOIN_EARLY_MIN: 15,

  // ------------------------------------------------------------------
  // المراحل والصفوف (النظام العراقي). يمكنك التعديل أو الإضافة بحرية.
  // id: رمز ثابت بالإنكليزية (لا تغيّره بعد بدء النشر) — subjects: مجموعة المواد
  // exam: صف منتهٍ (امتحان وزاري)
  // ------------------------------------------------------------------
  STAGES: [
    {
      id: 'primary', name: 'الابتدائية', grades: [
        { id: 'p1', name: 'الأول الابتدائي', short: 'الأول', subjects: 'primary' },
        { id: 'p2', name: 'الثاني الابتدائي', short: 'الثاني', subjects: 'primary' },
        { id: 'p3', name: 'الثالث الابتدائي', short: 'الثالث', subjects: 'primary' },
        { id: 'p4', name: 'الرابع الابتدائي', short: 'الرابع', subjects: 'primary' },
        { id: 'p5', name: 'الخامس الابتدائي', short: 'الخامس', subjects: 'primary' },
        { id: 'p6', name: 'السادس الابتدائي', short: 'السادس', subjects: 'primary', exam: true },
      ],
    },
    {
      id: 'middle', name: 'المتوسطة', grades: [
        { id: 'm1', name: 'الأول المتوسط', short: 'الأول', subjects: 'middle' },
        { id: 'm2', name: 'الثاني المتوسط', short: 'الثاني', subjects: 'middle' },
        { id: 'm3', name: 'الثالث المتوسط', short: 'الثالث', subjects: 'middle', exam: true },
      ],
    },
    {
      id: 'prep', name: 'الإعدادية', grades: [
        { id: 'i4s', name: 'الرابع العلمي', short: 'الرابع العلمي', subjects: 'science' },
        { id: 'i4l', name: 'الرابع الأدبي', short: 'الرابع الأدبي', subjects: 'literary' },
        { id: 'i5b', name: 'الخامس الأحيائي', short: 'الخامس الأحيائي', subjects: 'science' },
        { id: 'i5a', name: 'الخامس التطبيقي', short: 'الخامس التطبيقي', subjects: 'applied' },
        { id: 'i5l', name: 'الخامس الأدبي', short: 'الخامس الأدبي', subjects: 'literary' },
        { id: 'i6b', name: 'السادس الأحيائي', short: 'السادس الأحيائي', subjects: 'science', exam: true },
        { id: 'i6a', name: 'السادس التطبيقي', short: 'السادس التطبيقي', subjects: 'applied', exam: true },
        { id: 'i6l', name: 'السادس الأدبي', short: 'السادس الأدبي', subjects: 'literary', exam: true },
      ],
    },
  ],

  SUBJECTS: {
    islamic: 'التربية الإسلامية',
    arabic: 'اللغة العربية',
    english: 'اللغة الإنكليزية',
    kurdish: 'اللغة الكردية',
    french: 'اللغة الفرنسية',
    math: 'الرياضيات',
    science: 'العلوم',
    social: 'الاجتماعيات',
    physics: 'الفيزياء',
    chemistry: 'الكيمياء',
    biology: 'الأحياء',
    computer: 'الحاسوب',
    history: 'التاريخ',
    geography: 'الجغرافية',
    economics: 'الاقتصاد',
    philosophy: 'الفلسفة وعلم النفس',
    other: 'مراجعة عامة / أخرى',
  },

  SUBJECT_SETS: {
    primary: ['arabic', 'math', 'science', 'english', 'islamic', 'social', 'kurdish', 'other'],
    middle: ['math', 'physics', 'chemistry', 'biology', 'arabic', 'english', 'islamic', 'social', 'computer', 'kurdish', 'french', 'other'],
    science: ['math', 'physics', 'chemistry', 'biology', 'arabic', 'english', 'islamic', 'computer', 'kurdish', 'french', 'other'],
    applied: ['math', 'physics', 'chemistry', 'arabic', 'english', 'islamic', 'computer', 'kurdish', 'french', 'other'],
    literary: ['arabic', 'english', 'math', 'history', 'geography', 'economics', 'philosophy', 'islamic', 'kurdish', 'french', 'other'],
  },
};
