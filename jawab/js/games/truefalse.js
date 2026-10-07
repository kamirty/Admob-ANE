// Quick-fire true or false statements.
(window.JawabGames = window.JawabGames || []).push({
  id: "truefalse",
  title: "صح أم خطأ",
  desc: "اقرأ الجملة وقرر بسرعة: صحيحة أم خاطئة؟",
  icon: "✅",
  color: "linear-gradient(135deg,#22b573,#1a9fd8)",

  start(ctx) {
    const PER_Q = 10, SECONDS = 8;
    const items = shuffle(JawabData.trueFalse).slice(0, 10);
    let i = 0, score = 0;

    const next = () => {
      if (!ctx.alive()) return;
      if (i >= items.length) return ctx.finish(score, items.length * PER_Q);
      const it = items[i];
      ctx.setProgress(i / items.length);
      ctx.area.innerHTML = `
        <p class="question">${it.s}</p>
        <div class="tf-options">
          <button class="option" data-v="1">صح ✔️</button>
          <button class="option" data-v="0">خطأ ✖️</button>
        </div>
        <div class="feedback"></div>`;
      const buttons = [...ctx.area.querySelectorAll(".option")];
      const fb = ctx.area.querySelector(".feedback");

      const answer = (v) => {
        ctx.stopTimer();
        buttons.forEach((b) => (b.disabled = true));
        buttons[it.t ? 0 : 1].classList.add("correct");
        if (v === it.t) {
          score += PER_Q;
          ctx.setScore(score);
          fb.textContent = "أحسنت! ✅";
          fb.className = "feedback good";
        } else {
          if (v !== null) buttons[v ? 0 : 1].classList.add("wrong");
          fb.textContent = v === null ? "انتهى الوقت ⏰" : "للأسف، خطأ ❌";
          fb.className = "feedback bad";
        }
        i++;
        setTimeout(next, 1100);
      };

      buttons.forEach((b) => b.addEventListener("click", () => answer(b.dataset.v === "1")));
      ctx.startTimer(SECONDS, null, () => answer(null));
    };
    next();
  },
});
