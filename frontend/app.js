/**
 * Prompt Roulette — Frontend Application Logic
 */

const API = {
  GENERATE_URL: "https://xu27tiuthkyvoruzrrfym4y56y0zjvhm.lambda-url.ap-south-1.on.aws/",
  GALLERY_URL: "https://jyqdnepdyt7ryji7aacrhsrmnu0qjpod.lambda-url.ap-south-1.on.aws/"
};

const CATEGORIES = [
  { id: "haiku", label: "Haiku", color: "#8b5cf6" },
  { id: "meme_caption", label: "Meme Caption", color: "#ec4899" },
  { id: "plot_twist", label: "Plot Twist", color: "#3b82f6" },
  { id: "band_name", label: "Band Name", color: "#10b981" },
  { id: "villain_line", label: "Villain Line", color: "#f59e0b" },
  { id: "weird_invention", label: "Weird Invention", color: "#06b6d4" }
];

let currentPrompt = null;
let isSpinning = false;
let currentAngle = 0;

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  const wheelCanvas = document.getElementById("wheelCanvas");
  if (wheelCanvas) {
    initWheel(wheelCanvas);
    setupWheelControls();
  }

  const galleryGrid = document.getElementById("galleryGrid");
  if (galleryGrid) {
    loadGallery();
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

    // Slice background
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 4, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = CATEGORIES[i].color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Slice Text
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Outfit, sans-serif";
    ctx.fillText(CATEGORIES[i].label, radius - 20, 5);
    ctx.restore();
  }

  // Center circle cap
  ctx.beginPath();
  ctx.arc(radius, radius, 30, 0, 2 * Math.PI);
  ctx.fillStyle = "#0b0d17";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function setupWheelControls() {
  const spinBtn = document.getElementById("spinBtn");
  const spinAgainBtn = document.getElementById("spinAgainBtn");
  const remixBtn = document.getElementById("remixBtn");
  const saveBtn = document.getElementById("saveBtn");
  const copyBtn = document.getElementById("copyBtn");

  if (spinBtn) spinBtn.addEventListener("click", () => spinWheel(null));
  if (spinAgainBtn) spinAgainBtn.addEventListener("click", () => spinWheel(null));
  if (remixBtn) remixBtn.addEventListener("click", () => {
    if (currentPrompt) spinWheel(currentPrompt.category);
  });
  if (saveBtn) saveBtn.addEventListener("click", saveCurrentPrompt);
  if (copyBtn) copyBtn.addEventListener("click", copyPromptToClipboard);
}

async function spinWheel(forcedCategory = null) {
  if (isSpinning) return;
  isSpinning = true;

  const spinBtn = document.getElementById("spinBtn");
  const actionButtons = document.getElementById("actionButtons");
  const placeholderText = document.getElementById("placeholderText");
  const resultText = document.getElementById("resultText");
  const resultCard = document.getElementById("resultCard");
  const resCategory = document.getElementById("resCategory");
  const resRarity = document.getElementById("resRarity");

  if (spinBtn) spinBtn.disabled = true;
  if (actionButtons) actionButtons.classList.add("hidden");
  if (placeholderText) {
    placeholderText.classList.remove("hidden");
    placeholderText.textContent = "Rolling the wheel & invoking Lambda backend...";
  }
  if (resultText) resultText.classList.add("hidden");
  if (resultCard) resultCard.className = "card result-card";
  if (resRarity) resRarity.classList.add("hidden");

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
    showToast("Backend connection notice. Falling back to local generation engine.");
    apiResponse = generateLocalFallback(forcedCategory);
  }

  currentPrompt = apiResponse;

  // Animate wheel to land on returned category
  const targetCategoryIndex = CATEGORIES.findIndex(c => c.id === apiResponse.category);
  const numSlices = CATEGORIES.length;
  const sliceAngle = 360 / numSlices;
  
  // Calculate target rotation angle so pointer (top / -90deg) points to category center
  const categoryCenterAngle = targetCategoryIndex * sliceAngle + sliceAngle / 2;
  const targetPointerAngle = 270 - categoryCenterAngle; // 270 deg is top pointer
  const extraRotations = (5 + Math.floor(Math.random() * 3)) * 360; // 5-7 full spins
  const finalAngle = currentAngle + extraRotations + ((targetPointerAngle - (currentAngle % 360) + 360) % 360);
  
  currentAngle = finalAngle;

  const wheelEl = document.getElementById("wheel");
  if (wheelEl) {
    wheelEl.style.transition = "transform 3.5s cubic-bezier(0.15, 0.9, 0.25, 1)";
    wheelEl.style.transform = `rotate(${finalAngle}deg)`;
  }

  // Wait for spin animation to complete
  setTimeout(() => {
    isSpinning = false;
    if (spinBtn) spinBtn.disabled = false;

    // Display Result
    displayResult(apiResponse);
  }, 3600);
}

function displayResult(data) {
  const placeholderText = document.getElementById("placeholderText");
  const resultText = document.getElementById("resultText");
  const resCategory = document.getElementById("resCategory");
  const resRarity = document.getElementById("resRarity");
  const resultCard = document.getElementById("resultCard");
  const actionButtons = document.getElementById("actionButtons");

  if (placeholderText) placeholderText.classList.add("hidden");

  const catObj = CATEGORIES.find(c => c.id === data.category) || { label: data.category };
  if (resCategory) resCategory.textContent = catObj.label.toUpperCase();

  if (resRarity) {
    resRarity.textContent = data.rarity.toUpperCase();
    resRarity.className = `badge rarity-badge rarity-${data.rarity}`;
    resRarity.classList.remove("hidden");
  }

  if (data.rarity === "legendary") {
    if (resultCard) resultCard.classList.add("rarity-legendary-card");
    triggerConfetti();
  }

  // Typewriter animation for prompt text
  if (resultText) {
    resultText.classList.remove("hidden");
    typewriterEffect(resultText, data.text, () => {
      if (actionButtons) actionButtons.classList.remove("hidden");
    });
  }
}

function typewriterEffect(element, text, onComplete) {
  element.textContent = "";
  let i = 0;
  const speed = 25; // ms per char

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    } else if (onComplete) {
      onComplete();
    }
  }
  type();
}

async function saveCurrentPrompt() {
  if (!currentPrompt) return;
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        entry_id: currentPrompt.id,
        category: currentPrompt.category,
        text: currentPrompt.text,
        rarity: currentPrompt.rarity
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast("✨ Prompt saved to public gallery!");
  } catch (err) {
    console.error("Error saving prompt:", err);
    showToast("Failed to save to gallery.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function copyPromptToClipboard() {
  if (!currentPrompt) return;
  navigator.clipboard.writeText(currentPrompt.text).then(() => {
    showToast("📋 Copied prompt to clipboard!");
  }).catch(() => {
    showToast("Failed to copy.");
  });
}

/* --- Gallery Page Logic --- */

async function loadGallery() {
  const statusEl = document.getElementById("galleryStatus");
  const gridEl = document.getElementById("galleryGrid");

  try {
    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.items || [];

    if (statusEl) statusEl.classList.add("hidden");
    if (gridEl) {
      gridEl.classList.remove("hidden");
      renderGalleryItems(items, gridEl);
    }
  } catch (err) {
    console.error("Error loading gallery:", err);
    if (statusEl) {
      statusEl.innerHTML = `<p style="color:#ef4444">Gallery connection offline.</p>`;
    }
  }
}

function renderGalleryItems(items, container) {
  if (!items || items.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted);">No prompts saved in gallery yet. Be the first to spin and save!</div>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const catObj = CATEGORIES.find(c => c.id === item.category) || { label: item.category };
    const formattedDate = item.created_at ? new Date(item.created_at).toLocaleDateString() : "";
    const isLegendary = item.rarity === "legendary";

    return `
      <div class="card gallery-card ${isLegendary ? 'rarity-legendary-card' : ''}">
        <div class="card-header">
          <span class="badge category-badge">${catObj.label.toUpperCase()}</span>
          <span class="badge rarity-badge rarity-${item.rarity}">${(item.rarity || 'common').toUpperCase()}</span>
        </div>
        <div class="card-body">
          <p class="result-text" style="font-size: 1.05rem;">${escapeHtml(item.text)}</p>
        </div>
        <div class="gallery-footer">
          <span class="time-stamp">${formattedDate}</span>
          <button class="upvote-btn" data-id="${item.entry_id}" onclick="handleUpvote('${item.entry_id}', this)">
            <span>▲ Upvote</span>
            <span class="vote-count">${item.votes || 0}</span>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function handleUpvote(entryId, btnElement) {
  if (btnElement.disabled) return;
  btnElement.disabled = true;

  const countSpan = btnElement.querySelector(".vote-count");
  const currentVotes = parseInt(countSpan.textContent, 10) || 0;
  countSpan.textContent = currentVotes + 1; // Optimistic update

  try {
    const res = await fetch(API.GALLERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upvote", entry_id: entryId })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast("▲ Upvoted!");
  } catch (err) {
    console.error("Upvote error:", err);
    countSpan.textContent = currentVotes; // Revert
    showToast("Failed to upvote.");
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
  const container = document.getElementById("confetti-container");
  if (!container) return;
  container.innerHTML = "";

  const colors = ["#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#fef08a"];
  for (let i = 0; i < 60; i++) {
    const particle = document.createElement("div");
    particle.style.position = "absolute";
    particle.style.width = `${Math.random() * 10 + 6}px`;
    particle.style.height = `${Math.random() * 10 + 6}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${Math.random() * 100}vw`;
    particle.style.top = `-20px`;
    particle.style.borderRadius = "50%";
    particle.style.opacity = Math.random() + 0.5;

    const duration = Math.random() * 2 + 1.5;
    particle.style.transition = `transform ${duration}s linear, opacity ${duration}s linear`;
    container.appendChild(particle);

    setTimeout(() => {
      particle.style.transform = `translateY(105vh) rotate(${Math.random() * 720}deg)`;
      particle.style.opacity = "0";
    }, 50);
  }
}

function generateLocalFallback(category) {
  const cats = ["haiku", "meme_caption", "plot_twist", "band_name", "villain_line", "weird_invention"];
  const chosenCat = (category && category !== "random") ? category : cats[Math.floor(Math.random() * cats.length)];
  
  const samplePrompts = {
    haiku: "Keyboard keys click fast\nhoping the unit tests will pass\nfinally it works",
    meme_caption: "When you fix a bug in production and suddenly the whole architecture makes sense.",
    plot_twist: "The brave detective searched for the lost treasure, only to discover that they were the villain all along.",
    band_name: "Electric Flamingos and the Funk Syndicate",
    villain_line: "Foolish hero! I shall delete dark mode across all applications, and there is nothing your pitiful power can do to stop me!",
    weird_invention: "A solar-powered shoelace untier that accurately predicts stock market trends based on toast darkness."
  };

  return {
    id: "local-" + Math.random().toString(36).substring(2, 9),
    category: chosenCat,
    text: samplePrompts[chosenCat] || `Generated ${chosenCat} prompt!`,
    rarity: Math.random() > 0.9 ? "legendary" : (Math.random() > 0.7 ? "rare" : "common"),
    created_at: new Date().toISOString()
  };
}
