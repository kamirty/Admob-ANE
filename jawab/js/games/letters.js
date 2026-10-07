// Unscramble the letters to spell the word shown in the picture.
(window.JawabGames = window.JawabGames || []).push({
  id: "letters",
  title: "رتّب الحروف",
  desc: "انظر إلى الصورة ورتب الحروف لتكوّن الكلمة",
  icon: "🔤",
  color: "linear-gradient(135deg,#1a9fd8,#5b4cf0)",

  start(ctx) {
    const ROUNDS = 6, PER_WORD = 10;
    const words = shuffle(JawabData.words).slice(0, ROUNDS);
    let i = 0, score = 0;

    const next = () => {
      if (!ctx.alive()) return;
      if (i >= words.length) return ctx.finish(score, ROUNDS * PER_WORD);
      const { e, w } = words[i];
      const letters = [...w];
      let tiles = shuffle(letters);
      // Avoid showing the word already solved.
      if (letters.length > 1) while (tiles.join("") === w) tiles = shuffle(letters);
      let picked = []; // indices into tiles
      let mistakes = 0;
      let busy = false; // ignore input while showing feedback
      ctx.setProgress(i / words.length);

      ctx.area.innerHTML = `
        <div class="word-hint">${e}</div>
        <div class="slots">${letters.map(() => `<span class="slot"></span>`).join("")}</div>
        <div class="tiles">${tiles.map((t, k) => `<button class="tile" data-k="${k}">${t}</button>`).join("")}</div>
        <div class="row-actions"><button class="btn" data-act="undo">↩️ تراجع</button></div>
        <div class="feedback"></div>`;
      const slots = [...ctx.area.querySelectorAll(".slot")];
      const tileEls = [...ctx.area.querySelectorAll(".tile")];
      const fb = ctx.area.querySelector(".feedback");

      const draw = () => {
        slots.forEach((s, k) => {
          s.textContent = picked[k] !== undefined ? tiles[picked[k]] : "";
          s.classList.toggle("filled", picked[k] !== undefined);
        });
        tileEls.forEach((t, k) => (t.disabled = picked.includes(k)));
      };

      const check = () => {
        busy = true;
        if (picked.map((k) => tiles[k]).join("") === w) {
          const gained = Math.max(PER_WORD - mistakes * 3, 2);
          score += gained;
          ctx.setScore(score);
          fb.textContent = `رائع! الكلمة هي «${w}» +${gained}`;
          fb.className = "feedback good";
          tileEls.forEach((t) => (t.disabled = true));
          i++;
          setTimeout(next, 1300);
        } else {
          mistakes++;
          fb.textContent = "ليست صحيحة، حاول مرة أخرى";
          fb.className = "feedback bad";
          setTimeout(() => { if (ctx.alive()) { picked = []; busy = false; draw(); } }, 700);
        }
      };

      tileEls.forEach((t) => t.addEventListener("click", () => {
        if (busy) return;
        picked.push(+t.dataset.k);
        draw();
        if (picked.length === letters.length) check();
      }));
      ctx.area.querySelector("[data-act=undo]").addEventListener("click", () => {
        if (busy) return;
        picked.pop();
        fb.textContent = "";
        draw();
      });
    };
    next();
  },
});
