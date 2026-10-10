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
  LOCALE: 'ar-OM-u-nu-latn',

  // كم يوماً قادماً يظهر في جدول الطالب
  DAYS_AHEAD: 14,
  // قبل كم دقيقة من بداية الحصة يصبح زر الدخول فعّالاً
  JOIN_EARLY_MIN: 15,

  // ------------------------------------------------------------------
  // المراحل والصفوف (نظام التعليم في سلطنة عُمان). يمكنك التعديل أو الإضافة بحرية.
  // id: رمز ثابت بالإنجليزية (لا تغيّره بعد بدء النشر) — subjects: مجموعة المواد
  // exam: صف امتحانات دبلوم التعليم العام
  // ------------------------------------------------------------------
  EXAM_TAG: 'دبلوم',
  EXAM_PILL: 'دبلوم التعليم العام',
  STAGES: [
    {
      id: 'cycle1', name: 'الحلقة الأولى (1–4)', grades: [
        { id: 'g1', name: 'الصف الأول', short: 'الأول', subjects: 'cycle1' },
        { id: 'g2', name: 'الصف الثاني', short: 'الثاني', subjects: 'cycle1' },
        { id: 'g3', name: 'الصف الثالث', short: 'الثالث', subjects: 'cycle1' },
        { id: 'g4', name: 'الصف الرابع', short: 'الرابع', subjects: 'cycle1' },
      ],
    },
    {
      id: 'cycle2', name: 'الحلقة الثانية (5–12)', grades: [
        { id: 'g5', name: 'الصف الخامس', short: 'الخامس', subjects: 'cycle2' },
        { id: 'g6', name: 'الصف السادس', short: 'السادس', subjects: 'cycle2' },
        { id: 'g7', name: 'الصف السابع', short: 'السابع', subjects: 'cycle2' },
        { id: 'g8', name: 'الصف الثامن', short: 'الثامن', subjects: 'cycle2' },
        { id: 'g9', name: 'الصف التاسع', short: 'التاسع', subjects: 'cycle2' },
        { id: 'g10', name: 'الصف العاشر', short: 'العاشر', subjects: 'cycle2' },
        { id: 'g11', name: 'الصف الحادي عشر', short: 'الحادي عشر', subjects: 'post' },
        { id: 'g12', name: 'الصف الثاني عشر', short: 'الثاني عشر', subjects: 'post', exam: true },
      ],
    },
  ],

  SUBJECTS: {
    islamic: 'التربية الإسلامية',
    arabic: 'اللغة العربية',
    english: 'اللغة الإنجليزية',
    math: 'الرياضيات',
    math_core: 'الرياضيات الأساسية',
    math_adv: 'الرياضيات المتقدمة',
    science: 'العلوم',
    social: 'الدراسات الاجتماعية',
    physics: 'الفيزياء',
    chemistry: 'الكيمياء',
    biology: 'الأحياء',
    earth: 'علوم الأرض والبيئة',
    it: 'تقنية المعلومات',
    life_skills: 'المهارات الحياتية',
    history: 'التاريخ',
    geography: 'الجغرافيا والتقنيات الحديثة',
    homeland: 'هذا وطني',
    other: 'مراجعة عامة / أخرى',
  },

  SUBJECT_SETS: {
    cycle1: ['arabic', 'math', 'science', 'english', 'islamic', 'social', 'life_skills', 'other'],
    cycle2: ['math', 'science', 'arabic', 'english', 'islamic', 'social', 'it', 'life_skills', 'other'],
    post: ['math_core', 'math_adv', 'physics', 'chemistry', 'biology', 'arabic', 'english', 'islamic',
      'earth', 'geography', 'history', 'homeland', 'it', 'other'],
  },
};
