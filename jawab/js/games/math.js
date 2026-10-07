// Timed arithmetic challenge with selectable difficulty.
(window.JawabGames = window.JawabGames || []).push({
  id: "math",
  title: "تحدي الحساب",
  desc: "جاوب على أكبر عدد من المسائل خلال 60 ثانية",
  icon: "➗",
  color: "linear-gradient(135deg,#ff9f1c,#ff6b6b)",

  levels: {
    easy: { title: "سهل", icon: "🌱", ops: ["+", "-"], max: 10 },
    medium: { title: "متوسط", icon: "🔥", ops: ["+", "-", "×"], max: 20 },
    hard: { title: "صعب", icon: "🚀", ops: ["+", "-", "×", "÷"], max: 50 },
  },

  start(ctx) {
    ctx.area.innerHTML = `
      <p class="question">اختر المستوى</p>
      <div class="picker">
        ${Object.entries(this.levels).map(([k, l]) => `
          <button class="option" data-lvl="${k}"><span>${l.icon}</span>${l.title}</button>`).join("")}
      </div>`;
    ctx.area.querySelectorAll("[data-lvl]").forEach((b) =>
      b.addEventListener("click", () => this.play(ctx, this.levels[b.dataset.lvl])));
  },

  makeProblem(level) {
    const r = (n) => Math.floor(Math.random() * n) + 1;
    const op = level.ops[Math.floor(Math.random() * level.ops.length)];
    let a = r(level.max), b = r(level.max), ans;
    if (op === "+") ans = a + b;
    if (op === "-") { if (b > a) [a, b] = [b, a]; ans = a - b; }
    if (op === "×") { a = r(Math.min(12, level.max)); b = r(10); ans = a * b; }
    if (op === "÷") { b = r(10); ans = r(10); a = b * ans; }
    const opts = new Set([ans]);
    while (opts.size < 4) {
      const d = ans + (Math.floor(Math.random() * 11) - 5);
      if (d >= 0) opts.add(d);
    }
    return { text: `${a} ${op} ${b} = ؟`, ans, opts: shuffle([...opts]) };
  },

  play(ctx, level) {
    const SECONDS = 60, PER_Q = 5, TARGET = 20; // max score assumes ~20 correct answers
    let score = 0, solved = 0;

    const next = () => {
      if (!ctx.alive()) return;
      const p = this.makeProblem(level);
      ctx.area.innerHTML = `
        <p class="question"><span class="big" dir="ltr">${p.text}</span></p>
        <div class="options">${p.opts.map((o) => `<button class="option" data-v="${o}">${o}</button>`).join("")}</div>
        <div class="feedback">حللت ${solved} مسألة</div>`;
      ctx.area.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => {
        if (+b.dataset.v === p.ans) {
          score += PER_Q; solved++;
          ctx.setScore(score);
          ctx.setProgress(Math.min(1, solved / TARGET));
          b.classList.add("correct");
          setTimeout(next, 250);
        } else {
          b.classList.add("wrong");
          b.disabled = true;
        }
      }));
    };

    ctx.startTimer(SECONDS, null, () => ctx.finish(score, TARGET * PER_Q));
    next();
  },
});
