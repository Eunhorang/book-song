import assert from "node:assert/strict";
import test from "node:test";
import handler, { __testables } from "../api/plays.js";

const request = ({ method = "GET", origin = "https://eunhorang.github.io", body } = {}) => ({
  method,
  body,
  headers: origin ? { origin } : {},
});

const response = () => {
  const result = { headers: {}, statusCode: 200, body: null, ended: false };
  return {
    result,
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    end() {
      result.ended = true;
      return this;
    },
  };
};

const withEnvironment = async (callback) => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  try {
    await callback();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test("곡 번호와 UUID 형식을 제한한다", () => {
  assert.equal(__testables.TRACK_ID.test("01"), true);
  assert.equal(__testables.TRACK_ID.test("10"), true);
  assert.equal(__testables.TRACK_ID.test("11"), true);
  assert.equal(__testables.TRACK_ID.test("12"), true);
  assert.equal(__testables.TRACK_ID.test("13"), true);
  assert.equal(__testables.TRACK_ID.test("14"), true);
  assert.equal(__testables.TRACK_ID.test("15"), false);
  assert.equal(__testables.TRACK_ID.test("00"), false);
  assert.equal(__testables.EVENT_ID.test("123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(__testables.EVENT_ID.test("not-an-event"), false);
});

test("공개 사이트와 로컬 QA 주소만 브라우저 Origin으로 허용한다", () => {
  assert.equal(__testables.allowedOrigin("https://eunhorang.github.io"), true);
  assert.equal(__testables.allowedOrigin("http://127.0.0.1:4190"), true);
  assert.equal(__testables.allowedOrigin("https://example.com"), false);
});

test("누락된 곡은 0회로 정규화한다", () => {
  const counts = __testables.normalizedCounts([{ track_id: "02", play_count: 7 }]);
  assert.equal(Object.keys(counts).length, 14);
  assert.equal(counts["01"], 0);
  assert.equal(counts["02"], 7);
  assert.equal(counts["10"], 0);
  assert.equal(counts["11"], 0);
  assert.equal(counts["12"], 0);
  assert.equal(counts["13"], 0);
  assert.equal(counts["14"], 0);
});

test("허용되지 않은 Origin은 데이터베이스 호출 전에 거절한다", async () => {
  const res = response();
  await handler(request({ origin: "https://example.com" }), res);
  assert.equal(res.result.statusCode, 403);
});

test("GET은 14곡 누적 재생수를 반환한다", async () => {
  await withEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      JSON.stringify([{ track_id: "01", play_count: 3 }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    try {
      const res = response();
      await handler(request(), res);
      assert.equal(res.result.statusCode, 200);
      assert.equal(res.result.body.counts["01"], 3);
      assert.equal(res.result.body.counts["09"], 0);
      assert.equal(res.result.body.counts["10"], 0);
      assert.equal(res.result.body.counts["11"], 0);
      assert.equal(res.result.body.counts["12"], 0);
      assert.equal(res.result.body.counts["13"], 0);
      assert.equal(res.result.body.counts["14"], 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("30초 미만 POST는 저장하지 않는다", async () => {
  const res = response();
  await handler(
    request({
      method: "POST",
      body: {
        trackId: "01",
        eventId: "123e4567-e89b-42d3-a456-426614174000",
        playedSeconds: 29.9,
      },
    }),
    res,
  );
  assert.equal(res.result.statusCode, 400);
});

test("14번 곡의 유효한 POST 결과를 정규화한다", async () => {
  await withEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
      JSON.stringify([{ track_id: "14", play_count: 14, counted: true }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    try {
      const res = response();
      await handler(
        request({
          method: "POST",
          body: {
            trackId: "14",
            eventId: "123e4567-e89b-42d3-a456-426614174000",
            playedSeconds: 30,
          },
        }),
        res,
      );
      assert.equal(res.result.statusCode, 200);
      assert.deepEqual(res.result.body, { trackId: "14", playCount: 14, counted: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
