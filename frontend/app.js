/**
 * Prompt Roulette — Frontend Application Logic
 */

const API = {
  GENERATE_URL: "https://xu27tiuthkyvoruzrrfym4y56y0zjvhm.lambda-url.ap-south-1.on.aws/",
  GALLERY_URL: "https://jyqdnepdyt7ryji7aacrhsrmnu0qjpod.lambda-url.ap-south-1.on.aws/"
};

const CATEGORIES = [
  { id: "haiku", label: "HAIKU", color: "#2d2724" },
  { id: "meme_caption", label: "MEME CAPTION", color: "#3d3531" },
  { id: "plot_twist", label: "PLOT TWIST", color: "#2d2724" },
  { id: "band_name", label: "BAND NAME", color: "#3d3531" },
  { id: "villain_line", label: "VILLAIN MONOLOGUE", color: "#2d2724" },
  { id: "weird_invention", label: "WEIRD INVENTION", color: "#3d3531" }
];

let currentPrompt = null;
let isSpinning = false;
let currentAngle = 0;
let galleryItemsCache = [];

/* --- Firebase Authentication Integration --- */
const firebaseConfig = window.FIREBASE_CONFIG || {};

if (window.firebase) {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    firebase.auth().onAuthStateChanged((user) => {
      updateNavAuthUI(user);
    });
  } catch (e) {
    console.error("Firebase init error:", e);
  }
}

async function getAuthToken() {
  if (!window.firebase || !firebase.auth().currentUser) return null;
  try {
    return await firebase.auth().currentUser.getIdToken();
  } catch (err) {
    console.error("Failed to get Firebase ID token:", err);
    return null;
  }
}

async function loginWithGoogle() {
  if (!window.firebase) {
    showToast("Firebase Auth not loaded.");
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
    showToast("👋 Signed in with Google!");
  } catch (err) {
    console.error("Google Sign-In error:", err);
    if (err.code !== "auth/popup-closed-by-user") {
      showToast("Sign-in failed. Please try again.");
    }
  }
}

async function logoutUser() {
  if (!window.firebase) return;
  try {
    await firebase.auth().signOut();
    showToast("Logged out successfully.");
  } catch (err) {
    console.error("Sign-out error:", err);
  }
}

function updateNavAuthUI(user) {
  const profileIcons = document.querySelectorAll(".profile-icon");
  profileIcons.forEach((btn) => {
    if (user) {
      const displayName = user.displayName || user.email || "User";
      const avatarUrl = user.photoURL;
      if (avatarUrl) {
        btn.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(displayName)}" class="user-avatar-img" title="Signed in as ${escapeHtml(displayName)} (Click to Sign Out)" />`;
      } else {
        const initials = displayName.charAt(0).toUpperCase();
        btn.innerHTML = `<span class="user-avatar-initial" title="Signed in as ${escapeHtml(displayName)} (Click to Sign Out)">${initials}</span>`;
      }
      btn.onclick = (e) => {
        e.preventDefault();
        if (confirm(`Signed in as ${displayName}.\nDo you want to sign out?`)) {
          logoutUser();
        }
      };
    } else {
      btn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
        </svg>
      `;
      btn.title = "Sign in with Google";
      btn.onclick = (e) => {
        e.preventDefault();
        loginWithGoogle();
      };
    }
  });
}

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  if (window.firebase) {
    updateNavAuthUI(firebase.auth().currentUser);
  }
  const wheelCanvas = document.getElementById("wheelCanvas");
  if (wheelCanvas) {
    initWheel(wheelCanvas);
    setupWheelControls();
  }

  const galleryGrid = document.getElementById("galleryGrid");
  if (galleryGrid) {
    loadGallery();
    setupSortControl();
  }
});

/* --- Wheel Drawing & Controls --- */

function initWheel(canvas) {
  const ctx = canvas.getContext("2d");
  const numSlices = CATEGORIES.length;
  const sliceAngle = (2 * Math.PI) / numSlices;
  const radius = canvas.width / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < numSlices; i++) {
    const startAngle = i * sliceAngle;
    const endAngle = (i + 1) * sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;

    // Slice background
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 4, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = CATEGORIES[i].color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Slice Text with 180-degree flip for bottom-half wedges
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(midAngle);

    const normalizedAngle = (midAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

    // Bottom half is between PI/2 (90 deg) and 3*PI/2 (270 deg)
    if (normalizedAngle > Math.PI / 2 && normalizedAngle < (3 * Math.PI) / 2) {
      ctx.rotate(Math.PI);
      ctx.textAlign = "left";
      ctx.fillStyle = "#f5f0eb";
      ctx.font = "700 11px 'Outfit', sans-serif";
      ctx.fillText(CATEGORIES[i].label, -(radius - 24), 4);
    } else {
      ctx.textAlign = "right";
      ctx.fillStyle = "#f5f0eb";
      ctx.font = "700 11px 'Outfit', sans-serif";
      ctx.fillText(CATEGORIES[i].label, radius - 24, 4);
    }
    ctx.restore();
  }

  // Center gold circle cap with dice icon
  ctx.beginPath();
  ctx.arc(radius, radius, 26, 0, 2 * Math.PI);
  ctx.fillStyle = "#d9ab38";
  ctx.fill();
  ctx.strokeStyle = "#191512";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#191512";
  ctx.fillText("🎲", radius, radius + 1);
}

function setupWheelControls() {
  const spinBtn = document.getElementById("spinBtn");
  const modalSpinAgain = document.getElementById("modalSpinAgain");
  const modalSave = document.getElementById("modalSave");
  const modalClose = document.getElementById("modalClose");

  if (spinBtn) spinBtn.addEventListener("click", () => spinWheel());
  if (modalSpinAgain) modalSpinAgain.addEventListener("click", () => {
    closeTicketModal();
    spinWheel();
  });
  if (modalSave) modalSave.addEventListener("click", saveCurrentPrompt);
  if (modalClose) modalClose.addEventListener("click", closeTicketModal);
}

async function spinWheel(forcedCategory = null) {
  if (isSpinning) return;
  isSpinning = true;

  const spinBtn = document.getElementById("spinBtn");
  if (spinBtn) spinBtn.disabled = true;

  // Call Lambda backend API
  let payload = { category: forcedCategory || "random" };
  let apiResponse = null;

  try {
    const res = await fetch(API.GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    apiResponse = await res.json();
  } catch (err) {
    console.error("Backend generation error:", err);
    showToast("Using offline fallback engine.");
    apiResponse = generateLocalFallback(forcedCategory);
  }

  currentPrompt = apiResponse;

  // Animate wheel to land on returned category
  const targetCategoryIndex = CATEGORIES.findIndex(c => c.id === apiResponse.category);
  const numSlices = CATEGORIES.length;
  const sliceAngle = 360 / numSlices;
  
  const categoryCenterAngle = targetCategoryIndex * sliceAngle + sliceAngle / 2;
  const targetPointerAngle = 270 - categoryCenterAngle; // 270 deg is top pointer
  const extraRotations = (5 + Math.floor(Math.random() * 3)) * 360;
  const finalAngle = currentAngle + extraRotations + ((targetPointerAngle - (currentAngle % 360) + 360) % 360);
  
  currentAngle = finalAngle;

  const wheelEl = document.getElementById("wheelCanvas");
  if (wheelEl) {
    wheelEl.style.transition = "transform 3.5s cubic-bezier(0.15, 0.9, 0.25, 1)";
    wheelEl.style.transform = `rotate(${finalAngle}deg)`;
  }

  // Wait for spin animation to complete
  setTimeout(() => {
    isSpinning = false;
    if (spinBtn) spinBtn.disabled = false;
    showTicketModal(apiResponse);
  }, 3600);
}

function showTicketModal(data) {
  const modal = document.getElementById("ticketModal");
  if (!modal) return;

  const catObj = CATEGORIES.find(c => c.id === data.category) || { label: data.category.toUpperCase() };
  
  const ticketNo = document.getElementById("ticketNo");
  const ticketCategory = document.getElementById("ticketCategory");
  const ticketStamp = document.getElementById("ticketStamp");
  const ticketQuote = document.getElementById("ticketQuote");

  if (ticketNo) ticketNo.textContent = `NO. ${Math.floor(10000 + Math.random() * 90000)}`;
  if (ticketCategory) ticketCategory.textContent = catObj.label;
  
  if (ticketStamp) {
    ticketStamp.textContent = data.rarity.toUpperCase();
    ticketStamp.className = `stamp-badge stamp-${data.rarity}`;
  }

  if (data.rarity === "legendary") {
    triggerConfetti();
  }

  if (ticketQuote) {
    typewriterEffect(ticketQuote, `"${data.text}"`);
  }

  modal.classList.add("active");
}

function closeTicketModal() {
  const modal = document.getElementById("ticketModal");
  if (modal) modal.classList.remove("active");
}

function typewriterEffect(element, text) {
  element.textContent = "";
  let i = 0;
  const speed = 20;

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

async function saveCurrentPrompt() {
  if (!currentPrompt) return;
  const user = window.firebase ? firebase.auth().currentUser : null;
  if (!user) {
    showToast("🔒 Sign in with Google to save prompts!");
    await loginWithGoogle();
    if (!firebase.auth().currentUser) return;
  }

  const modalSave = document.getElementById("modalSave");
  if (modalSave) modalSave.disabled = true;

  try {
    const token = await getAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        action: "save",
        entry_id: currentPrompt.id,
        category: currentPrompt.category,
        text: currentPrompt.text,
        rarity: currentPrompt.rarity
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    showToast("✨ Saved to Prize Gallery!");
    closeTicketModal();
  } catch (err) {
    console.error("Error saving prompt:", err);
    showToast(`Failed to save: ${err.message || "Error"}`);
  } finally {
    if (modalSave) modalSave.disabled = false;
  }
}

/* --- Gallery Page Logic --- */

async function loadGallery() {
  const emptyState = document.getElementById("emptyState");
  const gridEl = document.getElementById("galleryGrid");

  try {
    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    galleryItemsCache = data.items || [];

    renderGallery();
  } catch (err) {
    console.error("Error loading gallery:", err);
    if (emptyState) {
      emptyState.classList.remove("hidden");
    }
  }
}

function setupSortControl() {
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => renderGallery());
  }
}

function renderGallery() {
  const emptyState = document.getElementById("emptyState");
  const gridEl = document.getElementById("galleryGrid");
  const sortSelect = document.getElementById("sortSelect");

  if (!galleryItemsCache || galleryItemsCache.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    if (gridEl) gridEl.classList.add("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  if (gridEl) gridEl.classList.remove("hidden");

  let sorted = [...galleryItemsCache];
  const sortVal = sortSelect ? sortSelect.value : "newest";

  if (sortVal === "top") {
    sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  } else {
    sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  gridEl.innerHTML = sorted.map((item, idx) => {
    const catObj = CATEGORIES.find(c => c.id === item.category) || { label: item.category.toUpperCase() };
    const ticketNo = String(idx + 1).padStart(3, "0");

    return `
      <div class="gallery-card">
        <div class="card-top-bar">
          <span class="card-number">No. ${ticketNo}</span>
          <span class="card-badge ${item.rarity}">${(item.rarity || 'common').toUpperCase()}</span>
        </div>
        <h2 class="card-title">${escapeHtml(catObj.label)}</h2>
        <p class="card-body-text">"${escapeHtml(item.text)}"</p>
        <div class="card-perforation"></div>
        <div class="card-bottom-bar">
          <span class="card-category-tag">🏷️ ${catObj.label}</span>
          <button class="upvote-btn" data-id="${item.entry_id}" onclick="handleUpvote('${item.entry_id}', this)" title="Upvote prompt">
            <span>👍</span>
            <span class="vote-count">${item.votes || 0}</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function handleUpvote(entryId, btnElement) {
  const user = window.firebase ? firebase.auth().currentUser : null;
  if (!user) {
    showToast("🔒 Sign in with Google to upvote!");
    await loginWithGoogle();
    if (!firebase.auth().currentUser) return;
  }

  if (btnElement.disabled) return;
  btnElement.disabled = true;

  const countSpan = btnElement.querySelector(".vote-count");
  const currentVotes = parseInt(countSpan.textContent, 10) || 0;
  countSpan.textContent = currentVotes + 1; // Optimistic update

  try {
    const token = await getAuthToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ action: "upvote", entry_id: entryId })
    });

    if (res.status === 409) {
      countSpan.textContent = currentVotes; // Revert
      showToast("⚠️ You have already upvoted this ticket!");
      btnElement.disabled = true;
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    showToast("👍 Upvoted!");
    const item = galleryItemsCache.find(i => i.entry_id === entryId);
    if (item) item.votes = (item.votes || 0) + 1;
  } catch (err) {
    console.error("Upvote error:", err);
    countSpan.textContent = currentVotes; // Revert
    showToast(`Failed: ${err.message || "Error"}`);
    btnElement.disabled = false;
  }
}

/* --- Utilities --- */

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function triggerConfetti() {
  const container = document.getElementById("confetti-container") || document.body;
  const colors = ["#d9ab38", "#c04838", "#008080", "#f5f0eb"];

  for (let i = 0; i < 50; i++) {
    const particle = document.createElement("div");
    particle.style.position = "fixed";
    particle.style.width = `${Math.random() * 8 + 4}px`;
    particle.style.height = `${Math.random() * 8 + 4}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${Math.random() * 100}vw`;
    particle.style.top = `-10px`;
    particle.style.zIndex = "999";
    particle.style.pointerEvents = "none";
    particle.style.borderRadius = "50%";
    particle.style.opacity = Math.random() + 0.5;

    const duration = Math.random() * 2 + 1.5;
    particle.style.transition = `transform ${duration}s linear, opacity ${duration}s linear`;
    container.appendChild(particle);

    setTimeout(() => {
      particle.style.transform = `translateY(105vh) rotate(${Math.random() * 720}deg)`;
      particle.style.opacity = "0";
    }, 50);

    setTimeout(() => particle.remove(), duration * 1000);
  }
}

function generateLocalFallback(category) {
  const cats = ["haiku", "meme_caption", "plot_twist", "band_name", "villain_line", "weird_invention"];
  const chosenCat = (category && category !== "random") ? category : cats[Math.floor(Math.random() * cats.length)];
  
  const samplePrompts = {
    haiku: "Keyboard keys click fast / hoping the unit tests will pass / finally it works",
    meme_caption: "When you fix a bug in production and suddenly the whole architecture makes sense.",
    plot_twist: "The brave detective searched for the lost treasure, only to discover that they were the villain all along.",
    band_name: "Electric Flamingos and the Funk Syndicate",
    villain_line: "Foolish hero! I shall delete dark mode across all applications!",
    weird_invention: "A solar-powered shoelace untier that accurately predicts stock market trends."
  };

  return {
    id: "local-" + Math.random().toString(36).substring(2, 9),
    category: chosenCat,
    text: samplePrompts[chosenCat] || `Generated ${chosenCat} prompt!`,
    rarity: Math.random() > 0.9 ? "legendary" : (Math.random() > 0.7 ? "rare" : "common"),
    created_at: new Date().toISOString()
  };
}
