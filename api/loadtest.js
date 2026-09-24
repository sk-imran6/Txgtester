export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const LOADTEST_KEY = "TXGTEST77878@TRSG";

  const key = req.headers["x-loadtest-key"];

  if (key !== LOADTEST_KEY) {
    return res.status(401).json({
      error: "Invalid test key"
    });
  }

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON"
      });
    }
  }

  body = body || {};

  const target = String(body.url || "").trim();

  let rps = Number(body.rps);
  let total = Number(body.requests);

  if (!target) {
    return res.status(400).json({
      error: "Gateway URL is required"
    });
  }

  try {
    const parsed = new URL(target);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      throw new Error();
    }
  } catch {
    return res.status(400).json({
      error: "Invalid Gateway URL"
    });
  }

  if (!Number.isFinite(rps)) rps = 10000;
  if (!Number.isFinite(total)) total = 100000;

  rps = Math.min(
    Math.max(Math.floor(rps), 1),
    50000000000
  );

  total = Math.min(
    Math.max(Math.floor(total), 1),
    5000000000000
  );

  let success = 0;
  let failed = 0;
  let sent = 0;

  const times = [];
  const statusCodes = {};

  async function sendRequest() {
    const start = Date.now();

    try {
      const response = await fetch(target, {
        method: "GET",
        headers: {
          "User-Agent": "TXG-Gateway-LoadTest/1.0"
        },
        signal: AbortSignal.timeout(10000)
      });

      const ms = Date.now() - start;

      times.push(ms);

      const status = String(response.status);

      statusCodes[status] =
        (statusCodes[status] || 0) + 1;

      if (
        response.status >= 200 &&
        response.status < 400
      ) {
        success++;
      } else {
        failed++;
      }

    } catch {
      times.push(Date.now() - start);

      failed++;

      statusCodes.ERROR =
        (statusCodes.ERROR || 0) + 1;
    }
  }

  const testStart = Date.now();

  while (sent < total) {

    const batch = Math.min(
      rps,
      total - sent
    );

    const jobs = [];

    for (let i = 0; i < batch; i++) {
      jobs.push(sendRequest());
    }

    sent += batch;

    await Promise.all(jobs);

    if (sent < total) {
      await new Promise(resolve =>
        setTimeout(resolve, 1000)
      );
    }
  }

  const duration =
    (Date.now() - testStart) / 1000;

  times.sort((a, b) => a - b);

  const average =
    times.length
      ? times.reduce((a, b) => a + b, 0) /
        times.length
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

    actual_rps:
      Number((sent / duration).toFixed(2)),

    total_requests: total,

    sent,

    success_count: success,

    failed_count: failed,

    duration_seconds:
      Number(duration.toFixed(2)),

    average_ms:
      Math.round(average),

    p95_ms: p95,

    status_codes: statusCodes

  });
}
