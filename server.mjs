import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number.parseInt(process.env.PORT || "4173", 10);
const channelFeed =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UChh-akEbUM8_6ghGVnJd6cQ";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("ok");
      return;
    }

    if (url.pathname === "/api/videos") {
      const videos = await fetchLatestVideos();
      sendJson(response, videos);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Server error");
  }
}).listen(port, () => {
  console.log(`Badminton Match Deck running at http://localhost:${port}`);
});

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function sendJson(response, body) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function fetchLatestVideos() {
  const fallback = await readFallbackVideos();
  let feedVideos = [];

  try {
    const response = await fetch(channelFeed, {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "BadmintonMatchDeck/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`BWF feed returned ${response.status}`);
    }

    const xml = await response.text();
    feedVideos = parseFeed(xml)
      .map(toVideo)
      .filter(Boolean)
      .sort(sortByQuality);
  } catch (error) {
    console.warn(`Using bundled videos: ${error.message}`);
  }

  const byId = new Map();

  for (const video of [...fallback, ...feedVideos]) {
    if (!byId.has(video.id)) {
      byId.set(video.id, video);
    }
  }

  return [...byId.values()]
    .sort(sortByQuality)
    .slice(0, 18)
    .map(({ curatedRank, ...video }) => video);
}

function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    return {
      id: readTag(entry, "yt:videoId"),
      title: decodeXml(readTag(entry, "title")),
      published: readTag(entry, "published")?.slice(0, 10),
      description: decodeXml(readTag(entry, "media:description") || ""),
    };
  });
}

function toVideo(entry) {
  if (!entry.id || !entry.title || isShortForm(entry.title)) {
    return null;
  }

  const isCourtStream = /\|\s*Day\s+\d+\s*\|\s*Court\s+\d+/i.test(entry.title);
  const isMatch = /\svs\s/i.test(entry.title);
  const isRelevantTournament =
    /(Open|Masters|Championships|Cup|Finals|World Tour|Sudirman|Thomas|Uber)/i.test(
      entry.title,
    );

  if (!isRelevantTournament || (!isCourtStream && !isMatch)) {
    return null;
  }

  const parts = entry.title.split("|").map((part) => part.trim());
  const tournamentParts = isCourtStream
    ? parts.slice(0, 2)
    : parts.filter((part) => !/\svs\s/i.test(part));
  const matchPart =
    parts.find((part) => /\svs\s/i.test(part)) ||
    (isCourtStream ? `${parts[2]} | ${parts[3]}` : parts.slice(-1)[0]);

  return {
    id: entry.id,
    title: matchPart,
    tournament: tournamentParts.join(" | "),
    source: "BWF TV",
    published: entry.published,
    priority: getPriority(entry.title),
  };
}

function sortByQuality(a, b) {
  const scoreA = getScore(a);
  const scoreB = getScore(b);

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  const rankA = Number.isFinite(a.curatedRank) ? a.curatedRank : 999;
  const rankB = Number.isFinite(b.curatedRank) ? b.curatedRank : 999;

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return String(b.published).localeCompare(String(a.published));
}

function getScore(video) {
  const priorityScore = {
    final: 50,
    semifinal: 40,
    "latest-court": 30,
    quarterfinal: 20,
    match: 10,
  };
  const ageScore = Date.parse(video.published || "") || 0;

  return (priorityScore[video.priority] || 0) * 1_000_000_000_000 + ageScore;
}

function getPriority(title) {
  if (/\|\s*F\s*$/i.test(title) || /\bFinal\b/i.test(title)) return "final";
  if (/\|\s*SF\s*$/i.test(title) || /\bSemifinal\b/i.test(title)) return "semifinal";
  if (/\|\s*QF\s*$/i.test(title) || /\bQuarterfinal\b/i.test(title)) return "quarterfinal";
  if (/\|\s*Court\s+\d+/i.test(title)) return "latest-court";
  return "match";
}

function isShortForm(title) {
  return /(shorts|highlights|moments|weekly|play of the day|interview|preview)/i.test(title);
}

async function readFallbackVideos() {
  const script = await readFile(join(root, "videos.js"), "utf8");
  const window = {};

  try {
    Function("window", script)(window);
  } catch {
    return [];
  }

  if (!Array.isArray(window.BADMINTON_VIDEOS)) {
    return [];
  }

  return window.BADMINTON_VIDEOS.map((video, index) => ({
    ...video,
    curatedRank: index,
  }));
}

function readTag(text, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`))?.[1];
}

function decodeXml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
