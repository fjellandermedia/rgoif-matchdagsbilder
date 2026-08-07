"use strict";

/* Publishes the current canvas to Facebook/Instagram via a GitHub repo that
 * acts as (a) public image hosting (Meta's APIs fetch images by URL, they
 * don't accept direct uploads) and (b) the trigger for a GitHub Actions
 * workflow that talks to the Graph API — either immediately (workflow_dispatch)
 * or later, by dropping a queue file a scheduled workflow run picks up.
 * See .github/workflows/publish.yml and scripts/publish.py.
 */

const BRANCH = "main";

const gh = {
  $repo: document.getElementById("ghRepo"),
  $token: document.getElementById("ghToken"),
};

// Restore saved GitHub settings (kept only in this browser's localStorage).
gh.$repo.value = localStorage.getItem("mdg_gh_repo") || "";
gh.$token.value = localStorage.getItem("mdg_gh_token") || "";
gh.$repo.addEventListener("change", () => localStorage.setItem("mdg_gh_repo", gh.$repo.value.trim()));
gh.$token.addEventListener("change", () => localStorage.setItem("mdg_gh_token", gh.$token.value.trim()));

const publishAtInput = document.getElementById("publishAt");
document.querySelectorAll('input[name="publishWhen"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    publishAtInput.disabled = document.getElementById("publishNow").checked;
  });
});

function setStatus(msg, isError) {
  const el = document.getElementById("publishStatus");
  el.textContent = msg;
  el.style.color = isError ? "#ff8a8a" : "";
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function githubApi(path, options = {}) {
  const token = gh.$token.value.trim();
  const repo = gh.$repo.value.trim();
  if (!token || !repo) throw new Error("Fyll i GitHub-repo och Personal Access Token (se inställningarna ovan).");

  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) { /* ignore */ }
    if (res.status === 404) {
      throw new Error(`Hittade inte repot eller filen (404). Kontrollera repo-namnet och att .github/workflows/publish.yml är pushat till "${BRANCH}". ${detail}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GitHub nekade åtkomst (${res.status}). Kontrollera att token är giltig och har rättigheter till repot. ${detail}`);
    }
    throw new Error(`GitHub-fel ${res.status}: ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

async function uploadFile(path, base64Content, message) {
  return githubApi(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64Content, branch: BRANCH }),
  });
}

async function dispatchWorkflow(inputs) {
  return githubApi(`/actions/workflows/publish.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: BRANCH, inputs }),
  });
}

// btoa() only handles Latin-1; captions may contain emoji or other
// characters outside that range, so encode as UTF-8 bytes first.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function slugForFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}`;
}

document.getElementById("publishBtn").addEventListener("click", async () => {
  const btn = document.getElementById("publishBtn");
  const caption = document.getElementById("postCaption").value.trim();
  const platforms = [];
  if (document.getElementById("platformFacebook").checked) platforms.push("facebook");
  if (document.getElementById("platformInstagram").checked) platforms.push("instagram");
  const isNow = document.getElementById("publishNow").checked;

  if (!platforms.length) { setStatus("Välj minst en plattform.", true); return; }
  if (!isNow && !publishAtInput.value) { setStatus("Välj datum och tid för schemaläggningen.", true); return; }
  if (!gh.$repo.value.trim() || !gh.$token.value.trim()) {
    setStatus("Fyll i GitHub-repo och Personal Access Token (se inställningarna ovan).", true);
    return;
  }

  btn.disabled = true;
  try {
    setStatus("Exporterar bild…");
    const blob = await canvasToJpegBlob(document.getElementById("cv"), 0.92);
    const base64 = await blobToBase64(blob);
    const slug = slugForFile();
    const imagePath = `images/${slug}.jpg`;

    setStatus("Laddar upp bild till GitHub…");
    await uploadFile(imagePath, base64, `Matchbild ${slug}`);

    if (isNow) {
      setStatus("Startar publicering nu…");
      await dispatchWorkflow({ image_path: imagePath, caption, platforms: platforms.join(",") });
      setStatus(`Klart! Publiceringen är igång (Facebook/Instagram tar vanligtvis under en minut). Följ förloppet under Actions-fliken i GitHub-repot.`);
    } else {
      const publishAtIso = new Date(publishAtInput.value).toISOString();
      const queuePath = `queue/${slug}.json`;
      setStatus("Schemalägger…");
      await uploadFile(queuePath, utf8ToBase64(JSON.stringify({
        image_path: imagePath, caption, platforms, publish_at: publishAtIso,
      })), `Schemalägg ${slug}`);
      setStatus(`Schemalagt till ${new Date(publishAtIso).toLocaleString("sv-SE")}. Publiceras automatiskt av GitHub Actions (kollar var 10:e minut).`);
    }
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    btn.disabled = false;
  }
});
