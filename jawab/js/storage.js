// Local player profile: name, total points, and best score per game.
window.Storage = (function () {
  const KEY = "jawab.profile.v1";
  const empty = () => ({ name: "", points: 0, best: {} });

  function load() {
    try {
      return Object.assign(empty(), JSON.parse(localStorage.getItem(KEY)) || {});
    } catch (e) {
      return empty();
    }
  }

  let profile = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { /* private mode */ }
  }

  return {
    get: () => profile,
    setName(name) { profile.name = name; save(); },
    addResult(gameId, score) {
      profile.points += score;
      const isBest = score > (profile.best[gameId] || 0);
      if (isBest) profile.best[gameId] = score;
      save();
      return isBest;
    },
    level: () => Math.floor(profile.points / 100) + 1,
  };
})();
