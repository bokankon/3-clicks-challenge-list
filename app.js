const config = window.SUPABASE_CONFIG || {};
const ADMIN_USERNAME = "admin";
const ADMIN_AUTH_EMAIL = "admin@gdlist.local";

const POINTS_TOP = 200;
const POINTS_REFERENCE_POSITION = 42;
const POINTS_REFERENCE_VALUE = 89.59;
const POINTS_MINIMUM = 1;

// Exponential falloff chosen so:
// #1 = 200 points
// #42 = 89.59 points
const POINTS_DECAY = Math.pow(
  POINTS_REFERENCE_VALUE / POINTS_TOP,
  1 / (POINTS_REFERENCE_POSITION - 1)
);

function getPointsFromPosition(position) {
  const safePosition = Math.max(1, Math.floor(Number(position) || 1));
  const calculated = POINTS_TOP * Math.pow(POINTS_DECAY, safePosition - 1);
  return Math.max(POINTS_MINIMUM, Math.round(calculated * 100) / 100);
}

function formatPoints(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}


const supabaseClient = window.supabase?.createClient?.(
  config.url,
  config.publishableKey
);

let state = { levels: [] };
let selectedLevelId = null;
let isAdmin = false;
let currentUser = null;

const els = {
  levelPage: document.getElementById("levelPage"),
  levelList: document.getElementById("levelList"),
  levelSearch: document.getElementById("levelSearch"),
  levelName: document.getElementById("levelName"),
  levelCreators: document.getElementById("levelCreators"),
  levelVerifier: document.getElementById("levelVerifier"),
  levelPublisher: document.getElementById("levelPublisher"),
  levelPosition: document.getElementById("levelPosition"),
  levelPoints: document.getElementById("levelPoints"),
  levelId: document.getElementById("levelId"),
  levelLdmId: document.getElementById("levelLdmId"),
  levelEnjoyability: document.getElementById("levelEnjoyability"),
  victorList: document.getElementById("victorList"),
  victorCount: document.getElementById("victorCount"),
  verificationFrame: document.getElementById("verificationFrame"),
  videoFallback: document.getElementById("videoFallback"),
  leaderboardTable: document.getElementById("leaderboardTable"),
  enjoyabilityTable: document.getElementById("enjoyabilityTable"),
  adminStatus: document.getElementById("adminStatus"),
  adminTools: document.getElementById("adminTools"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  levelForm: document.getElementById("levelForm"),
  victorForm: document.getElementById("victorForm"),
  levelModalTitle: document.getElementById("levelModalTitle"),
  orderList: document.getElementById("orderList"),
  toast: document.getElementById("toast")
};

function getOrderedLevels() {
  return [...state.levels].sort((a, b) => Number(a.position) - Number(b.position));
}

function getSelectedLevel() {
  return state.levels.find(level => level.id === selectedLevelId) || getOrderedLevels()[0] || null;
}

function normalizeLocalPositions(levels = state.levels) {
  levels
    .sort((a, b) => Number(a.position) - Number(b.position))
    .forEach((level, index) => {
      level.position = index + 1;
    });
}

function mapLevel(row) {
  return {
    id: row.id,
    position: Number(row.position) || 1,
    name: row.name || "Untitled level",
    creators: row.creators || "",
    publisher: row.publisher || "",
    verifier: row.verifier || "",
    verificationVideo: row.verification_video || "",
    enjoyability: Number(row.enjoyability) || 0,
    gdId: row.gd_id || "N/A",
    ldmId: row.ldm_id || "N/A",
    victors: (row.victors || [])
      .map(victor => ({
        id: victor.id,
        name: victor.name || "Unknown",
        video: victor.video || "",
        createdAt: victor.created_at || ""
      }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  };
}

function toLevelRow(data, position) {
  return {
    position,
    name: data.name,
    creators: data.creators,
    publisher: data.publisher,
    verifier: data.verifier,
    verification_video: data.verificationVideo,
    enjoyability: data.enjoyability,
    gd_id: data.gdId,
    ldm_id: data.ldmId
  };
}

async function loadLevels({ preserveSelection = true } = {}) {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("levels")
    .select(`
      id,
      position,
      name,
      creators,
      publisher,
      verifier,
      verification_video,
      enjoyability,
      gd_id,
      ldm_id,
      victors (
        id,
        name,
        video,
        created_at
      )
    `)
    .order("position", { ascending: true });

  if (error) {
    console.error(error);
    state.levels = [];
    renderAll();
    showToast("Could not load Supabase data. Run SETUP_SUPABASE.sql first.");
    return;
  }

  const oldSelection = selectedLevelId;
  state.levels = (data || []).map(mapLevel);
  normalizeLocalPositions();

  if (preserveSelection && oldSelection && state.levels.some(level => level.id === oldSelection)) {
    selectedLevelId = oldSelection;
  } else {
    selectedLevelId = getOrderedLevels()[0]?.id || null;
  }

  renderAll();
}

async function refreshAdminState(session = null) {
  isAdmin = false;
  currentUser = session?.user || null;

  if (!session?.user || !supabaseClient) {
    renderAdminState();
    return false;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
  }

  isAdmin = data?.role === "admin";
  renderAdminState();
  return isAdmin;
}

function renderAll() {
  renderAdminState();
  renderLevelList();
  renderSelectedLevel();
  renderLeaderboard();
  renderEnjoyability();

  const orderModal = document.getElementById("orderModal");
  if (orderModal && !orderModal.classList.contains("hidden")) renderOrderList();
}

function renderAdminState() {
  document.querySelectorAll(".admin-only").forEach(element => {
    element.classList.toggle("hidden", !isAdmin);
  });

  els.adminStatus.classList.toggle("hidden", !isAdmin);
  els.adminTools.classList.toggle("hidden", !isAdmin);
}

function renderLevelList() {
  const query = els.levelSearch.value.trim().toLowerCase();
  const levels = getOrderedLevels().filter(level => level.name.toLowerCase().includes(query));

  if (!levels.length) {
    els.levelList.innerHTML = '<div class="empty-state">No levels found.</div>';
    return;
  }

  els.levelList.innerHTML = levels.map(level => `
    <div class="level-item">
      <button class="level-row ${level.id === selectedLevelId ? "active" : ""}" data-level-id="${escapeAttr(level.id)}" type="button">
        <span class="level-rank">#${level.position}</span>
        <span class="level-name">${escapeHtml(level.name)}</span>
      </button>
    </div>
  `).join("");
}

function renderSelectedLevel() {
  const level = getSelectedLevel();

  if (!level) {
    els.levelName.textContent = "No levels yet";
    els.levelCreators.textContent = "";
    els.levelVerifier.textContent = "";
    els.levelPublisher.textContent = "";
    els.levelPosition.textContent = "";
    els.levelPoints.textContent = "0";
    els.levelId.textContent = "N/A";
    els.levelLdmId.textContent = "N/A";
    els.levelEnjoyability.textContent = "0.0";
    els.victorCount.textContent = "0";
    els.victorList.innerHTML = '<div class="empty-state">No victors yet.</div>';
    els.verificationFrame.src = "";
    els.verificationFrame.classList.add("hidden");
    els.videoFallback.classList.remove("hidden");
    els.levelPage.style.setProperty("--hero-thumb", "linear-gradient(135deg, #172338, #0d151f 58%, #101927)");
    return;
  }

  els.levelName.textContent = level.name;
  els.levelCreators.textContent = level.creators;
  els.levelVerifier.textContent = level.verifier;
  els.levelPublisher.textContent = level.publisher;
  els.levelPosition.textContent = `#${level.position}`;
  els.levelPoints.textContent = formatPoints(getPointsFromPosition(level.position));
  els.levelId.textContent = level.gdId || "N/A";
  els.levelLdmId.textContent = level.ldmId || "N/A";
  els.levelEnjoyability.textContent = Number(level.enjoyability).toFixed(1);

  const thumbnail = youtubeThumbnailUrl(level.verificationVideo);
  els.levelPage.style.setProperty(
    "--hero-thumb",
    thumbnail
      ? `url("${thumbnail}")`
      : "linear-gradient(135deg, #172338, #0d151f 58%, #101927)"
  );

  const victors = level.victors || [];
  els.victorCount.textContent = victors.length;
  els.victorList.innerHTML = victors.length
    ? victors.map(victor => `
        <div class="victor-row">
          <span class="victor-name">${escapeHtml(victor.name)}</span>
          <a class="watch-link" href="${escapeAttr(victor.video)}" target="_blank" rel="noopener noreferrer">Watch</a>
          ${isAdmin ? `<button class="victor-delete" data-delete-victor="${escapeAttr(victor.id)}" type="button" aria-label="Delete victor">×</button>` : ""}
        </div>
      `).join("")
    : '<div class="empty-state">No victors yet.</div>';

  const embed = youtubeEmbedUrl(level.verificationVideo);
  if (embed) {
    els.verificationFrame.src = embed;
    els.verificationFrame.classList.remove("hidden");
    els.videoFallback.classList.add("hidden");
  } else {
    els.verificationFrame.src = "";
    els.verificationFrame.classList.add("hidden");
    els.videoFallback.classList.remove("hidden");
  }
}

function renderLeaderboard() {
  const players = new Map();

  for (const level of state.levels) {
    const levelPoints = getPointsFromPosition(level.position);

    addPlayerScore(players, level.verifier, levelPoints);

    for (const victor of level.victors || []) {
      addPlayerScore(players, victor.name, levelPoints);
    }
  }

  const rows = [...players.values()]
    .sort((a, b) => b.points - a.points || b.completions - a.completions || a.name.localeCompare(b.name));

  if (!rows.length) {
    els.leaderboardTable.innerHTML = '<div class="empty-state">No leaderboard data.</div>';
    return;
  }

  els.leaderboardTable.innerHTML = `
    <div class="table-row table-header">
      <div>Rank</div>
      <div>Player</div>
      <div class="table-number">Points</div>
      <div class="table-muted">Completions</div>
    </div>
    ${rows.map((player, index) => `
      <div class="table-row">
        <div class="table-rank">#${index + 1}</div>
        <div class="table-name">${escapeHtml(player.name)}</div>
        <div class="table-number">${formatPoints(player.points)}</div>
        <div class="table-muted">${player.completions}</div>
      </div>
    `).join("")}
  `;
}

function addPlayerScore(map, rawName, rawPoints) {
  const name = String(rawName || "").trim();
  if (!name) return;

  const key = name.toLowerCase();
  const player = map.get(key) || { name, points: 0, completions: 0 };
  player.points += Number(rawPoints) || 0;
  player.completions += 1;
  map.set(key, player);
}

function renderEnjoyability() {
  const levels = [...state.levels].sort((a, b) => b.enjoyability - a.enjoyability || a.position - b.position);

  if (!levels.length) {
    els.enjoyabilityTable.innerHTML = '<div class="empty-state">No levels yet.</div>';
    return;
  }

  els.enjoyabilityTable.innerHTML = `
    <div class="table-row table-header">
      <div>Rank</div>
      <div>Level</div>
      <div class="table-number">Score</div>
      <div class="table-muted">List position</div>
    </div>
    ${levels.map((level, index) => `
      <div class="table-row clickable-row" data-open-level="${escapeAttr(level.id)}">
        <div class="table-rank">#${index + 1}</div>
        <div class="table-name">${escapeHtml(level.name)}</div>
        <div class="table-number">${Number(level.enjoyability).toFixed(1)}</div>
        <div class="table-muted">#${level.position}</div>
      </div>
    `).join("")}
  `;
}

function renderOrderList() {
  const levels = getOrderedLevels();

  els.orderList.innerHTML = levels.length ? levels.map((level, index) => `
    <div class="order-row">
      <div class="order-position">#${level.position}</div>
      <div class="order-level-name">${escapeHtml(level.name)}</div>
      <div class="order-controls">
        <button class="order-button" data-move-level="${escapeAttr(level.id)}" data-direction="up" type="button" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="order-button" data-move-level="${escapeAttr(level.id)}" data-direction="down" type="button" ${index === levels.length - 1 ? "disabled" : ""}>↓</button>
      </div>
    </div>
  `).join("") : '<div class="empty-state">No levels yet.</div>';
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active-view"));
  document.querySelectorAll(".nav-link").forEach(button => button.classList.remove("active"));

  document.getElementById(`${viewName}View`)?.classList.add("active-view");
  document.querySelector(`.nav-link[data-view="${viewName}"]`)?.classList.add("active");

  if (viewName === "leaderboard") renderLeaderboard();
  if (viewName === "enjoyability") renderEnjoyability();
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function requireAdmin() {
  if (isAdmin) return true;
  els.loginForm.reset();
  els.loginError.classList.add("hidden");
  openModal("loginModal");
  return false;
}

function openAddLevel() {
  if (!requireAdmin()) return;

  els.levelModalTitle.textContent = "Add level";
  els.levelForm.reset();
  document.getElementById("editingLevelId").value = "";
  document.getElementById("formEnjoyability").value = 7.5;
  document.getElementById("formPosition").value = state.levels.length + 1;
  openModal("levelModal");
}

function openEditLevel() {
  if (!requireAdmin()) return;
  const level = getSelectedLevel();
  if (!level) return;

  els.levelModalTitle.textContent = "Edit level";
  document.getElementById("editingLevelId").value = level.id;
  document.getElementById("formLevelName").value = level.name;
  document.getElementById("formCreators").value = level.creators;
  document.getElementById("formPublisher").value = level.publisher;
  document.getElementById("formVerifier").value = level.verifier;
  document.getElementById("formVideo").value = level.verificationVideo || "";
  document.getElementById("formEnjoyability").value = level.enjoyability;
  document.getElementById("formGdId").value = level.gdId === "N/A" ? "" : level.gdId;
  document.getElementById("formLdmId").value = level.ldmId === "N/A" ? "" : level.ldmId;
  document.getElementById("formPosition").value = level.position;
  openModal("levelModal");
}

function moveLevelLocally(levelId, requestedPosition) {
  const levels = getOrderedLevels();
  const index = levels.findIndex(level => level.id === levelId);
  if (index === -1) return levels;

  const [level] = levels.splice(index, 1);
  const target = Math.max(1, Math.min(Number(requestedPosition) || 1, levels.length + 1));
  levels.splice(target - 1, 0, level);
  levels.forEach((item, idx) => item.position = idx + 1);
  state.levels = levels;
  return levels;
}

async function persistOrder(levels = getOrderedLevels()) {
  const updates = levels.map((level, index) =>
    supabaseClient
      .from("levels")
      .update({ position: index + 1 })
      .eq("id", level.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}

async function moveLevelOneStep(levelId, direction) {
  if (!requireAdmin()) return;

  const levels = getOrderedLevels();
  const index = levels.findIndex(level => level.id === levelId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= levels.length) return;

  [levels[index], levels[targetIndex]] = [levels[targetIndex], levels[index]];
  levels.forEach((level, idx) => level.position = idx + 1);
  state.levels = levels;
  renderAll();

  try {
    await persistOrder(levels);
    await loadLevels();
  } catch (error) {
    console.error(error);
    showToast("Could not save the new order.");
    await loadLevels();
  }
}

async function deleteSelectedLevel() {
  if (!requireAdmin()) return;
  const level = getSelectedLevel();
  if (!level) return;
  if (!confirm(`Delete “${level.name}”?`)) return;

  const { error } = await supabaseClient.from("levels").delete().eq("id", level.id);
  if (error) {
    console.error(error);
    showToast("Could not delete level.");
    return;
  }

  selectedLevelId = null;
  await loadLevels({ preserveSelection: false });

  try {
    await persistOrder();
  } catch (error) {
    console.error(error);
  }

  await loadLevels({ preserveSelection: false });
  showToast("Level deleted.");
}

async function deleteVictor(victorId) {
  if (!requireAdmin()) return;
  const level = getSelectedLevel();
  if (!level) return;
  const victor = level.victors.find(item => item.id === victorId);
  if (!victor) return;
  if (!confirm(`Remove ${victor.name} from victors?`)) return;

  const { error } = await supabaseClient.from("victors").delete().eq("id", victorId);
  if (error) {
    console.error(error);
    showToast("Could not remove victor.");
    return;
  }

  await loadLevels();
  showToast("Victor removed.");
}

function readLevelForm() {
  return {
    name: document.getElementById("formLevelName").value.trim(),
    creators: document.getElementById("formCreators").value.trim(),
    publisher: document.getElementById("formPublisher").value.trim(),
    verifier: document.getElementById("formVerifier").value.trim(),
    verificationVideo: document.getElementById("formVideo").value.trim(),
    enjoyability: Number(document.getElementById("formEnjoyability").value),
    gdId: document.getElementById("formGdId").value.trim() || "N/A",
    ldmId: document.getElementById("formLdmId").value.trim() || "N/A"
  };
}

function getYouTubeId(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || "";
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] || "";
      return parsed.searchParams.get("v") || "";
    }
  } catch {}
  return "";
}

function youtubeEmbedUrl(url) {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
}

function youtubeThumbnailUrl(url) {
  const id = getYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add("hidden"), 2500);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) switchView(nav.dataset.view);

  const levelRow = event.target.closest("[data-level-id]");
  if (levelRow) {
    selectedLevelId = levelRow.dataset.levelId;
    renderLevelList();
    renderSelectedLevel();
    switchView("list");
  }

  const enjoyabilityRow = event.target.closest("[data-open-level]");
  if (enjoyabilityRow) {
    selectedLevelId = enjoyabilityRow.dataset.openLevel;
    renderLevelList();
    renderSelectedLevel();
    switchView("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const closeButton = event.target.closest("[data-close-modal]");
  if (closeButton) closeModal(closeButton.dataset.closeModal);

  const deleteVictorButton = event.target.closest("[data-delete-victor]");
  if (deleteVictorButton) deleteVictor(deleteVictorButton.dataset.deleteVictor);

  const moveButton = event.target.closest("[data-move-level]");
  if (moveButton && !moveButton.disabled) {
    moveLevelOneStep(moveButton.dataset.moveLevel, moveButton.dataset.direction);
  }
});

els.levelSearch.addEventListener("input", renderLevelList);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    ["loginModal", "levelModal", "victorModal", "orderModal"].forEach(closeModal);
  }

  if (
    event.shiftKey &&
    event.code === "Backquote" &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !isAdmin
  ) {
    event.preventDefault();
    els.loginForm.reset();
    els.loginError.classList.add("hidden");
    openModal("loginModal");
  }
});

els.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) return;

  const username = document.getElementById("adminUsername").value.trim();
  const password = document.getElementById("adminPassword").value;
  els.loginError.classList.add("hidden");

  if (username.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
    els.loginError.textContent = "Incorrect username or password.";
    els.loginError.classList.remove("hidden");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: ADMIN_AUTH_EMAIL,
    password
  });

  if (error || !data.session) {
    console.error(error);
    els.loginError.textContent = "Incorrect username or password.";
    els.loginError.classList.remove("hidden");
    return;
  }

  const allowed = await refreshAdminState(data.session);
  if (!allowed) {
    await supabaseClient.auth.signOut();
    currentUser = null;
    isAdmin = false;
    renderAdminState();
    els.loginError.textContent = "This account is not an admin.";
    els.loginError.classList.remove("hidden");
    return;
  }

  closeModal("loginModal");
  renderAll();
  showToast("Signed in as admin.");
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  isAdmin = false;
  currentUser = null;
  renderAll();
  showToast("Signed out.");
});

document.getElementById("addLevelButton").addEventListener("click", openAddLevel);
document.getElementById("editLevelButton").addEventListener("click", openEditLevel);
document.getElementById("deleteLevelButton").addEventListener("click", deleteSelectedLevel);
document.getElementById("addVictorButton").addEventListener("click", () => {
  if (!requireAdmin()) return;
  els.victorForm.reset();
  openModal("victorModal");
});
document.getElementById("manageOrderButton").addEventListener("click", () => {
  if (!requireAdmin()) return;
  renderOrderList();
  openModal("orderModal");
});

els.levelForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;

  const editingId = document.getElementById("editingLevelId").value;
  const requestedPosition = Number(document.getElementById("formPosition").value);
  const formData = readLevelForm();

  try {
    if (editingId) {
      const { error } = await supabaseClient
        .from("levels")
        .update(toLevelRow(formData, requestedPosition))
        .eq("id", editingId);

      if (error) throw error;

      const local = state.levels.find(level => level.id === editingId);
      if (local) Object.assign(local, formData);
      moveLevelLocally(editingId, requestedPosition);
      await persistOrder();
      selectedLevelId = editingId;
    } else {
      const { data, error } = await supabaseClient
        .from("levels")
        .insert(toLevelRow(formData, state.levels.length + 1))
        .select("id")
        .single();

      if (error) throw error;

      state.levels.push({
        id: data.id,
        position: state.levels.length + 1,
        ...formData,
        victors: []
      });
      moveLevelLocally(data.id, requestedPosition);
      await persistOrder();
      selectedLevelId = data.id;
    }

    closeModal("levelModal");
    await loadLevels();
    switchView("list");
    showToast(editingId ? "Level updated." : "Level added.");
  } catch (error) {
    console.error(error);
    showToast("Could not save level.");
    await loadLevels();
  }
});

els.victorForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!requireAdmin()) return;

  const level = getSelectedLevel();
  if (!level) return;

  const payload = {
    level_id: level.id,
    name: document.getElementById("victorName").value.trim(),
    video: document.getElementById("victorVideo").value.trim()
  };

  const { error } = await supabaseClient.from("victors").insert(payload);
  if (error) {
    console.error(error);
    showToast("Could not add victor.");
    return;
  }

  closeModal("victorModal");
  await loadLevels();
  showToast("Victor added.");
});

async function init() {
  if (!supabaseClient || !config.url || !config.publishableKey) {
    renderAll();
    showToast("Supabase configuration is missing.");
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.error(error);
  await refreshAdminState(data?.session || null);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => refreshAdminState(session), 0);
  });

  await loadLevels({ preserveSelection: false });
}

init();
