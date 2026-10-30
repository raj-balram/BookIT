import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://localhost:5000";
const SCENARIO = __ENV.SCENARIO || "flow";

const tokens = new SharedArray("tokens", () => JSON.parse(open("./data/users.json")));
const slotData = new SharedArray("slots", () => [JSON.parse(open("./data/slots.json"))]);
const data = slotData[0];
const USERS = tokens.length;
const FLOW_PER_USER = data.flow[0].length;

// 409 (lost the race) and 429 (hold cap) are EXPECTED answers here, not failures.
// Only 5xx, timeouts and unexpected 4xx count as failed requests.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 204 }, 409, 429));

const holdWon = new Counter("hold_won");
const holdLost = new Counter("hold_lost");
const holdCapped = new Counter("hold_capped");
const bookingsCreated = new Counter("bookings_created");

const headers = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...extra,
});
const myToken = () => tokens[(exec.vu.idInTest - 1) % USERS];

const defs = {
  contention: {
    scenario: { executor: "per-vu-iterations", vus: USERS, iterations: 1, maxDuration: "2m", exec: "contention" },
    thresholds: {
      http_req_failed: ["rate<0.01"],
      checks: ["rate>0.999"],
      "http_req_duration{name:hold}": ["p(95)<1500"],
    },
  },
  flow: {
    scenario: {
      executor: "per-vu-iterations",
      vus: Math.min(Number(__ENV.VUS || 50), USERS),
      iterations: FLOW_PER_USER,
      maxDuration: "5m",
      exec: "flow",
    },
    thresholds: {
      http_req_failed: ["rate<0.01"],
      checks: ["rate>0.99"],
      "http_req_duration{name:hold}": ["p(95)<800"],
      "http_req_duration{name:confirm}": ["p(95)<1000"],
    },
  },
  browse: {
    scenario: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "30s", target: 50 },
        { duration: "5s", target: 0 },
      ],
      exec: "browse",
    },
    thresholds: {
      http_req_failed: ["rate<0.01"],
      "http_req_duration{name:list}": ["p(95)<500"],
    },
  },
};

if (!defs[SCENARIO]) throw new Error(`Unknown SCENARIO "${SCENARIO}". Use contention, flow or browse.`);

export const options = {
  scenarios: { [SCENARIO]: defs[SCENARIO].scenario },
  thresholds: defs[SCENARIO].thresholds,
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

// ---- contention: every user races for every hot slot at the same moment ----
export function contention() {
  const token = myToken();
  for (const slotId of data.hot) {
    const res = http.post(`${BASE}/api/slots/${slotId}/hold`, null, {
      headers: headers(token),
      tags: { name: "hold" },
    });
    if (res.status === 200) holdWon.add(1);
    else if (res.status === 409) holdLost.add(1);
    else if (res.status === 429) holdCapped.add(1);
    check(res, { "hold answered 200, 409 or 429": (r) => [200, 409, 429].includes(r.status) });
  }
}

// ---- flow: hold -> confirm (+ occasional idempotent replay), each user on their own slots ----
let iter = 0; // each VU has its own JS runtime, so this counter is per VU
export function flow() {
  const u = exec.vu.idInTest - 1;
  const token = myToken();
  const slotId = data.flow[u][iter];
  const key = `k6-${exec.vu.idInTest}-${iter}-${Date.now()}`; // 8-64 chars: letters, digits, - _
  iter++;

  const hold = http.post(`${BASE}/api/slots/${slotId}/hold`, null, {
    headers: headers(token),
    tags: { name: "hold" },
  });
  if (!check(hold, { "hold 200": (r) => r.status === 200 })) return;

  const body = JSON.stringify({ slotId });
  const confirm = http.post(`${BASE}/api/bookings`, body, {
    headers: headers(token, { "Idempotency-Key": key }),
    tags: { name: "confirm" },
  });
    if (!check(confirm, { "confirm 201": (r) => r.status === 201 })) {
        if (exec.vu.idInTest === 1) console.error(`confirm failed: ${confirm.status} ${confirm.body}`);
        return;
    }

  // every 5th iteration retry the SAME request: must replay the original response, not run twice
  if (iter % 5 === 0) {
    const replay = http.post(`${BASE}/api/bookings`, body, {
      headers: headers(token, { "Idempotency-Key": key }),
      tags: { name: "replay" },
    });
    check(replay, {
      "replay 201": (r) => r.status === 201,
      "replay flagged": (r) => r.headers["Idempotent-Replayed"] === "true",
    });
  }
}

// ---- browse: read-heavy paginated listing ----
export function browse() {
  const page = 1 + Math.floor(Math.random() * 20);
  const res = http.get(`${BASE}/api/slots?status=AVAILABLE&limit=12&page=${page}`, {
    headers: headers(myToken()),
    tags: { name: "list" },
  });
  check(res, { "list 200": (r) => r.status === 200 });
  sleep(0.1);
}