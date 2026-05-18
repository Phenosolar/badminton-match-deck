let videos = Array.isArray(window.BADMINTON_VIDEOS) ? window.BADMINTON_VIDEOS : [];

const frame = document.querySelector("#videoFrame");
const title = document.querySelector("#matchTitle");
const tournament = document.querySelector("#tournamentText");
const counter = document.querySelector("#counterText");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const gestureZone = document.querySelector(".stage");

let currentIndex = getInitialIndex();
let pointerStartX = 0;
let pointerStartY = 0;
let pointerActive = false;

function getInitialIndex() {
  const hashIndex = Number.parseInt(window.location.hash.replace("#match-", ""), 10);
  if (Number.isInteger(hashIndex) && hashIndex >= 1 && hashIndex <= videos.length) {
    return hashIndex - 1;
  }

  return 0;
}

function getEmbedUrl(videoId, shouldAutoplay = false) {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });

  if (shouldAutoplay) {
    params.set("autoplay", "1");
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function renderVideo(index, shouldAutoplay = false) {
  if (!videos.length) {
    title.textContent = "No full matches loaded";
    tournament.textContent = "Add videos in videos.js";
    counter.textContent = "0 / 0";
    return;
  }

  currentIndex = (index + videos.length) % videos.length;
  const video = videos[currentIndex];

  frame.src = getEmbedUrl(video.id, shouldAutoplay);
  frame.title = `${video.title} - ${video.tournament}`;
  title.textContent = video.title;
  tournament.textContent = `${video.tournament} / ${video.source}`;
  counter.textContent = `${currentIndex + 1} / ${videos.length}`;
  window.history.replaceState(null, "", `#match-${currentIndex + 1}`);
}

function showNext() {
  renderVideo(currentIndex + 1, true);
}

function showPrevious() {
  renderVideo(currentIndex - 1, true);
}

function handlePointerDown(event) {
  pointerActive = true;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;

  if (gestureZone.setPointerCapture && event.pointerId !== undefined) {
    gestureZone.setPointerCapture(event.pointerId);
  }
}

function handlePointerUp(event) {
  if (!pointerActive) return;

  const deltaX = event.clientX - pointerStartX;
  const deltaY = event.clientY - pointerStartY;
  pointerActive = false;

  if (gestureZone.releasePointerCapture && event.pointerId !== undefined) {
    gestureZone.releasePointerCapture(event.pointerId);
  }

  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) {
    return;
  }

  if (deltaX < 0) {
    showNext();
  } else {
    showPrevious();
  }
}

function handleKeydown(event) {
  if (event.key === "ArrowRight") {
    showNext();
  }

  if (event.key === "ArrowLeft") {
    showPrevious();
  }
}

prevButton.addEventListener("click", showPrevious);
nextButton.addEventListener("click", showNext);
gestureZone.addEventListener("pointerdown", handlePointerDown);
gestureZone.addEventListener("pointerup", handlePointerUp);
gestureZone.addEventListener("pointercancel", () => {
  pointerActive = false;
});
window.addEventListener("keydown", handleKeydown);

loadVideos();

async function loadVideos() {
  renderVideo(currentIndex);

  if (!["http:", "https:"].includes(window.location.protocol)) {
    return;
  }

  try {
    const response = await fetch("/api/videos", { cache: "no-store" });
    if (!response.ok) return;

    const latestVideos = await response.json();
    if (!Array.isArray(latestVideos) || latestVideos.length === 0) return;

    const currentVideoId = videos[currentIndex]?.id;
    videos = latestVideos;
    const refreshedIndex = Math.max(
      0,
      videos.findIndex((video) => video.id === currentVideoId),
    );
    currentIndex = refreshedIndex;
    renderVideo(currentIndex);
  } catch {
    renderVideo(currentIndex);
  }
}
