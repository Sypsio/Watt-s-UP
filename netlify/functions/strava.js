exports.handler = async (event) => {
  const out = (code, body) => ({
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });

  let b;
  try { b = JSON.parse(event.body || '{}'); }
  catch (e) { return out(400, { error: 'Bad request' }); }

  const id = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) return out(500, { message: 'Strava keys are missing in Netlify settings' });

  try {
    if (b.action === 'config') return out(200, { client_id: id });

    if (b.action === 'token' || b.action === 'refresh') {
      const p = new URLSearchParams({ client_id: id, client_secret: secret });
      if (b.action === 'token') {
        p.set('code', b.code);
        p.set('grant_type', 'authorization_code');
      } else {
        p.set('refresh_token', b.refresh_token);
        p.set('grant_type', 'refresh_token');
      }
      const r = await fetch('https://www.strava.com/oauth/token', { method: 'POST', body: p });
      const j = await r.json();
      if (!r.ok) return out(r.status, { message: j.message || 'Token error' });
      return out(200, {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_at,
      });
    }

    const auth = { Authorization: 'Bearer ' + b.access_token };

    if (b.action === 'upload') {
      const f = new FormData();
      f.append('file', new Blob([b.tcx], { type: 'application/xml' }), 'ride.tcx');
      f.append('data_type', 'tcx');
      f.append('name', b.name || 'Ride');
      f.append('trainer', '1');
      f.append('activity_type', 'ride');
      f.append('external_id', b.external_id || String(Date.now()));
      const r = await fetch('https://www.strava.com/api/v3/uploads', { method: 'POST', headers: auth, body: f });
      const j = await r.json();
      return r.ok ? out(200, j) : out(r.status, { message: j.message || 'Upload error' });
    }

    if (b.action === 'status') {
      const r = await fetch('https://www.strava.com/api/v3/uploads/' + encodeURIComponent(b.id), { headers: auth });
      const j = await r.json();
      return out(r.ok ? 200 : r.status, j);
    }

    return out(400, { error: 'Unknown action' });
  } catch (e) {
    return out(500, { message: e.message });
  }
};
