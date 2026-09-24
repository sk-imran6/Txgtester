export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const key = req.headers["x-loadtest-key"];

  const LOADTEST_KEY = "TXGTEST77878@TRSG";

if (key !== LOADTEST_KEY) {

  const target = process.env.TEST_TARGET;

  if (!target) {
    return res.status(500).json({
      error: "TEST_TARGET is not configured"
    });
  }

  const body = req.body || {};

  let rps = Number(body.rps);
  let total = Number(body.requests);

  if (!Number.isFinite(rps)) rps = 10;
  if (!Number.isFinite(total)) total = 100;

  // Safety limits
  const MAX_RPS = 50;
  const MAX_REQUESTS = 500;

  rps = Math.min(
    Math.max(Math.floor(rps), 1),
    MAX_RPS
  );

  total = Math.min(
    Math.max(Math.floor(total), 1),
    MAX_REQUESTS
  );

  let sent = 0;
  let success = 0;
  let failed = 0;

  const times = [];
  const statusCodes = {};

  async function sendRequest() {
    const started = Date.now();

    try {
      const response = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "TXG-Controlled-LoadTest/1.0"
        },
        signal: AbortSignal.timeout(10000)
      });

      const ms = Date.now() - started;

      times.push(ms);

      const status = String(response.status);

      statusCodes[status] =
        (statusCodes[status] || 0) + 1;

      if (response.status >= 200 && response.status < 400) {
        success++;
      } else {
        failed++;
      }

    } catch {
      times.push(Date.now() - started);
      failed++;

      statusCodes.ERROR =
        (statusCodes.ERROR || 0) + 1;
    }
  }

  const startedAt = Date.now();

  // Approximately RPS requests every second
  while (sent < total) {

    const batch = Math.min(rps, total - sent);

    sent += batch;

    const jobs = [];

    for (let i = 0; i < batch; i++) {
      jobs.push(sendRequest());
    }

    await Promise.all(jobs);

    if (sent < total) {
      await new Promise(resolve =>
        setTimeout(resolve, 1000)
      );
    }
  }

  const duration =
    (Date.now() - startedAt) / 1000;

  times.sort((a, b) => a - b);

  const average =
    times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0;

  const p95 =
    times.length
      ? times[
          Math.min(
            Math.floor(times.length * 0.95),
            times.length - 1
          )
        ]
      : 0;

  return res.status(200).json({
    success: true,
    target,

    requested_rps: rps,
    total_requests: total,

    sent,
    success_count: success,
    failed_count: failed,

    duration_seconds:
      Number(duration.toFixed(2)),

    actual_rps:
      Number((sent / duration).toFixed(2)),

    average_ms:
      Math.round(average),

    p95_ms: p95,

    status_codes: statusCodes
  });
}
