// A business's own records for its scorecard, from a totals-only database function reached over Supabase's
// REST API (PostgREST). The function is the one in records-postgres.sql: it checks a hashed token and returns
// counts and rates only. Guide: docs/guides/scorecard-records.md. Node stdlib only.

/** Call `/rest/v1/rpc/<functionName>` with the project's PUBLIC key and the secret token; returns its snapshot. */
export async function fetchRecords({ url, publicKey, token, functionName = 'hq_scorecard', weeks = 12 }) {
  if (!/^[a-z_][a-z0-9_]*$/.test(functionName)) throw Error('bad function name');
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: { apikey: publicKey, authorization: `Bearer ${publicKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_weeks: weeks }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw Error(`records function: HTTP ${res.status}`);
  return res.json();
}
