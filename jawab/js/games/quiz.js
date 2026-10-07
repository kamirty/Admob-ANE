// Multiple-choice quiz by subject, with a timer per question.
(window.JawabGames = window.JawabGames || []).push({
  id: "quiz",
  title: "سؤال وجواب",
  desc: "اختر المادة وجاوب على الأسئلة قبل انتهاء الوقت",
  icon: "❓",
  color: "linear-gradient(135deg,#5b4cf0,#8f6bff)",

  start(ctx) {
    const cats = JawabData.quiz;
    ctx.area.innerHTML = `
      <p class="question">اختر المادة</p>
      <div class="picker">
        ${Object.keys(cats).map((k) => `
          <button class="option" data-cat="${k}"><span>${cats[k].icon}</span>${cats[k].title}</button>`).join("")}
      </div>`;
    ctx.area.querySelectorAll("[data-cat]").forEach((b) =>
      b.addEventListener("click", () => this.play(ctx, cats[b.dataset.cat].questions)));
  },

  play(ctx, pool) {
    const PER_Q = 10, SECONDS = 15;
    const questions = shuffle(pool).slice(0, 10);
    let i = 0, score = 0;

    const next = () => {
      if (!ctx.alive()) return;
      if (i >= questions.length) return ctx.finish(score, questions.length * PER_Q);
      const q = questions[i];
      // Shuffle options while remembering which is correct.
      const opts = shuffle(q.a.map((text, idx) => ({ text, ok: idx === q.c })));
      ctx.setProgress(i / questions.length);
      ctx.area.innerHTML = `
        <p class="question">${q.q}</p>
        <div class="options">${opts.map((o, k) => `<button class="option" data-k="${k}">${o.text}</button>`).join("")}</div>
        <div class="feedback"></div>`;
      const buttons = [...ctx.area.querySelectorAll(".option")];
      const fb = ctx.area.querySelector(".feedback");

      const answer = (k) => {
        ctx.stopTimer();
        buttons.forEach((b) => (b.disabled = true));
        buttons[opts.findIndex((o) => o.ok)].classList.add("correct");
        if (k !== null && opts[k].ok) {
          score += PER_Q;
          ctx.setScore(score);
          fb.textContent = "إجابة صحيحة! ✅";
          fb.className = "feedback good";
        } else {
          if (k !== null) buttons[k].classList.add("wrong");
          fb.textContent = k === null ? "انتهى الوقت ⏰" : "إجابة خاطئة ❌";
          fb.className = "feedback bad";
        }
        i++;
        setTimeout(next, 1200);
      };

      buttons.forEach((b) => b.addEventListener("click", () => answer(+b.dataset.k)));
      ctx.startTimer(SECONDS, null, () => answer(null));
    };
    next();
  },
});
