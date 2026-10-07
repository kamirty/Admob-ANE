// Jawab app shell: screens, player profile, and the context passed to each game.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const games = window.JawabGames;
  let current = null;
  let timerId = null;
  let runId = 0; // bumped whenever a game starts or is left, so stale callbacks are ignored

  function show(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("#screen-" + name).classList.add("active");
    window.scrollTo(0, 0);
  }

  function refreshHeader() {
    const p = Storage.get();
    $("#player-name").textContent = p.name ? "مرحباً " + p.name : "";
    $("#total-points").textContent = p.points;
    $("#player-level").textContent = Storage.level();
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  function renderHome() {
    const best = Storage.get().best;
    $("#games-grid").innerHTML = games.map((g) => `
      <button class="game-card" data-game="${g.id}" style="background:${g.color}">
        <span class="icon">${g.icon}</span>
        <h3>${g.title}</h3>
        <p>${g.desc}</p>
        <span class="best">أفضل نتيجة: ${best[g.id] || 0}</span>
      </button>`).join("");
    show("home");
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    $("#game-timer").hidden = true;
  }

  function startTimer(seconds, onTick, onEnd) {
    stopTimer();
    const el = $("#game-timer");
    let left = seconds;
    const draw = () => {
      el.textContent = "⏱️ " + left;
      el.classList.toggle("warn", left <= 5);
    };
    el.hidden = false;
    draw();
    timerId = setInterval(() => {
      left--;
      draw();
      if (onTick) onTick(left);
      if (left <= 0) { stopTimer(); onEnd(); }
    }, 1000);
  }

  function startGame(game) {
    current = game;
    stopTimer();
    $("#game-title").textContent = game.icon + " " + game.title;
    $("#game-score").textContent = 0;
    $("#game-progress").style.width = "0%";
    show("game");

    const run = ++runId;
    const live = (fn) => (...args) => { if (run === runId) return fn(...args); };
    const ctx = {
      area: $("#game-area"),
      alive: () => run === runId,
      setScore: live((n) => { $("#game-score").textContent = n; }),
      setProgress: live((f) => { $("#game-progress").style.width = Math.round(f * 100) + "%"; }),
      startTimer: live(startTimer),
      stopTimer: live(stopTimer),
      toast,
      finish: live((score, max) => { runId++; finishGame(game, score, max); }),
    };
    game.start(ctx);
  }

  function finishGame(game, score, max) {
    stopTimer();
    const ratio = max ? score / max : 0;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.3 ? 1 : 0;
    const levelBefore = Storage.level();
    const isBest = Storage.addResult(game.id, score);
    refreshHeader();

    const msgs = [
      ["💪", "حاول مرة أخرى!"],
      ["🙂", "بداية جيدة!"],
      ["👏", "أحسنت!"],
      ["🏆", "ممتاز! أنت بطل"],
    ];
    $("#result-emoji").textContent = msgs[stars][0];
    $("#result-title").textContent = msgs[stars][1];
    $("#result-text").textContent = `حصلت على ${score} من ${max} نقطة` + (isBest ? " — رقم قياسي جديد! 🎉" : "");
    $("#result-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    show("result");

    if (Storage.level() > levelBefore) toast("🎉 وصلت إلى المستوى " + Storage.level());
  }

  // Events
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      runId++;
      stopTimer();
      if (Storage.get().name) renderHome(); else show("welcome");
      return;
    }
    const card = e.target.closest("[data-game]");
    if (card) startGame(games.find((g) => g.id === card.dataset.game));
  });

  $("#btn-replay").addEventListener("click", () => current && startGame(current));

  $("#welcome-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#name-input").value.trim();
    if (!name) return;
    Storage.setName(name);
    refreshHeader();
    renderHome();
  });

  refreshHeader();
  if (Storage.get().name) renderHome(); else show("welcome");
})();
