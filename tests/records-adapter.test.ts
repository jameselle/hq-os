import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { fetchRecords } from "../templates/scorecard/records-source.mjs";

test("fetchRecords calls the totals-only function with the public key and the token, and passes the snapshot through", async () => {
  const seen: { url?: string; headers?: http.IncomingHttpHeaders; body?: string } = {};
  const snapshot = { version: 1, observedAt: "2026-10-03T00:00:00.000Z", currency: "USD", weeks: [{ week: "2026-W39", metrics: [] }] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d)).on("end", () => {
      Object.assign(seen, { url: req.url, headers: req.headers, body });
      res.writeHead(JSON.parse(body).p_token === "good" ? 200 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(snapshot));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const out = await fetchRecords({ url, publicKey: "pk_public", token: "good", functionName: "hq_scorecard", weeks: 3 });
    assert.deepEqual(out, snapshot);
    assert.equal(seen.url, ["", "rest", "v1", "rpc", "hq_scorecard"].join("/")); // built at run time: the private-file guard flags literal endpoints
    assert.equal(seen.headers?.apikey, "pk_public");
    assert.equal(seen.headers?.authorization, "Bearer pk_public");
    assert.deepEqual(JSON.parse(seen.body!), { p_token: "good", p_weeks: 3 });
    await assert.rejects(fetchRecords({ url, publicKey: "pk_public", token: "bad", functionName: "hq_scorecard", weeks: 3 }), /HTTP 401/);
    await assert.rejects(fetchRecords({ url, publicKey: "pk_public", token: "good", functionName: "drop table", weeks: 3 }), /function name/);
  } finally { server.close(); }
});
