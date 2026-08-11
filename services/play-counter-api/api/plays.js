const TRACK_ID = /^(?:0[1-9]|1[01])$/;
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;
const PRODUCTION_ORIGIN = "https://eunhorang.github.io";
const MINIMUM_PLAY_SECONDS = 30;

const allowedOrigin = (origin) =>
  !origin || origin === PRODUCTION_ORIGIN || LOCAL_ORIGIN.test(origin);

const setCommonHeaders = (response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Vary", "Origin");
};

const setCorsHeaders = (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
};

const send = (response, status, body) => {
  response.status(status).json(body);
};

const configuration = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url: String(url || "").replace(/\/$/, ""), key: String(key || "") };
};

const parseBody = (request) => {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string" && request.body.length <= 2048) {
    return JSON.parse(request.body);
  }
  return {};
};

const rpc = async (name, payload) => {
  const { url, key } = configuration();
  if (!url || !key) throw new Error("service-not-configured");
  const result = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(7000),
  });
  if (!result.ok) throw new Error(`database-request-failed:${result.status}`);
  return result.json();
};

const normalizedCounts = (rows) => {
  const counts = Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => [String(index + 1).padStart(2, "0"), 0]),
  );
  for (const row of Array.isArray(rows) ? rows : []) {
    if (TRACK_ID.test(row.track_id) && Number.isSafeInteger(Number(row.play_count))) {
      counts[row.track_id] = Math.max(0, Number(row.play_count));
    }
  }
  return counts;
};

export default async function handler(request, response) {
  setCommonHeaders(response);
  setCorsHeaders(request, response);

  if (!allowedOrigin(request.headers.origin)) {
    send(response, 403, { error: "허용되지 않은 요청입니다." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method === "GET") {
    try {
      const rows = await rpc("get_track_play_counts", {});
      response.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      send(response, 200, { counts: normalizedCounts(rows) });
    } catch (error) {
      console.error("play-count-read-failed", error instanceof Error ? error.message : "unknown");
      send(response, 503, { error: "재생수를 잠시 불러올 수 없습니다." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = parseBody(request);
      const trackId = String(body.trackId || "");
      const eventId = String(body.eventId || "");
      const playedSeconds = Number(body.playedSeconds);
      if (!TRACK_ID.test(trackId) || !EVENT_ID.test(eventId)) {
        send(response, 400, { error: "재생 기록 형식이 올바르지 않습니다." });
        return;
      }
      if (!Number.isFinite(playedSeconds) || playedSeconds < MINIMUM_PLAY_SECONDS || playedSeconds > 86400) {
        send(response, 400, { error: "30초 이상 재생된 기록만 집계합니다." });
        return;
      }

      const rows = await rpc("record_track_play", {
        p_track_id: trackId,
        p_event_id: eventId,
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || !TRACK_ID.test(row.track_id)) throw new Error("invalid-database-response");
      response.setHeader("Cache-Control", "no-store");
      send(response, 200, {
        trackId: row.track_id,
        playCount: Math.max(0, Number(row.play_count) || 0),
        counted: Boolean(row.counted),
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        send(response, 400, { error: "요청 내용을 확인해 주세요." });
        return;
      }
      console.error("play-count-write-failed", error instanceof Error ? error.message : "unknown");
      send(response, 503, { error: "재생 기록을 잠시 저장할 수 없습니다." });
    }
    return;
  }

  response.setHeader("Allow", "GET, POST, OPTIONS");
  send(response, 405, { error: "지원하지 않는 요청 방식입니다." });
}

export const __testables = {
  EVENT_ID,
  MINIMUM_PLAY_SECONDS,
  TRACK_ID,
  allowedOrigin,
  normalizedCounts,
  parseBody,
};
