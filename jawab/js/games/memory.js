// Memory match: pair each picture with its Arabic word.
(window.JawabGames = window.JawabGames || []).push({
  id: "memory",
  title: "لعبة الذاكرة",
  desc: "اقلب البطاقات وطابق كل صورة مع اسمها",
  icon: "🧠",
  color: "linear-gradient(135deg,#ef476f,#b5179e)",

  start(ctx) {
    const PAIRS = 8, PER_PAIR = 10;
    const pairs = shuffle(JawabData.memory).slice(0, PAIRS);
    const cards = shuffle(pairs.flatMap(([emoji, word], id) => [
      { id, html: `<span class="emoji">${emoji}</span>` },
      { id, html: word },
    ]));
    let open = [], matched = 0, moves = 0, lock = false;

    ctx.area.innerHTML = `
      <div class="memory-grid">${cards.map((c, k) => `<button class="mem-card" data-k="${k}" aria-label="بطاقة">${c.html}</button>`).join("")}</div>
      <div class="feedback">المحاولات: <b id="mem-moves">0</b></div>`;
    const els = [...ctx.area.querySelectorAll(".mem-card")];
    const movesEl = ctx.area.querySelector("#mem-moves");

    els.forEach((el) => el.addEventListener("click", () => {
      const k = +el.dataset.k;
      if (lock || el.classList.contains("open") || el.classList.contains("done")) return;
      el.classList.add("open");
      open.push(k);
      if (open.length < 2) return;

      moves++;
      movesEl.textContent = moves;
      const [a, b] = open;
      open = [];
      if (cards[a].id === cards[b].id) {
        els[a].classList.replace("open", "done");
        els[b].classList.replace("open", "done");
        matched++;
        ctx.setProgress(matched / PAIRS);
        ctx.setScore(this.score(matched, moves, PER_PAIR));
        if (matched === PAIRS) setTimeout(() => ctx.finish(this.score(matched, moves, PER_PAIR), PAIRS * PER_PAIR), 600);
      } else {
        lock = true;
        setTimeout(() => {
          els[a].classList.remove("open");
          els[b].classList.remove("open");
          lock = false;
        }, 900);
      }
    }));
  },

  // Full marks for a perfect game; each extra move beyond the minimum costs a point.
  score(matched, moves, perPair) {
    return Math.max(0, matched * perPair - Math.max(0, moves - matched));
  },
});
