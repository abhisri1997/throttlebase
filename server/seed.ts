const API_URL = 'http://localhost:5001';

async function apiFetch(path: string, options: any = {}) {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }
  return data;
}

const createClient = (token: string) => ({
  post: (path: string, body?: any) => apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${token}` }
  }),
  get: (path: string) => apiFetch(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  })
});

async function seed() {
  console.log('🌱 Starting ThrottleBase Seed Script (Bangalore Edition)...');

  try {
    // 1. Create Users
    console.log('Creating riders...');
    const users = [
      { username: 'nandi_racer', email: 'nandi@example.com', password: 'password123', display_name: 'Rahul K' },
      { username: 'bullet_bhai', email: 'bullet@example.com', password: 'password123', display_name: 'Vikram S' },
      { username: 'weekend_cruiser', email: 'cruise@example.com', password: 'password123', display_name: 'Priya R' }
    ];

    const tokens = [];
    for (const u of users) {
      try {
        const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(u) });
        console.log(`Registered ${u.username}`, !!res.token);
        tokens.push(res.token);
      } catch (e: any) {
        if (e.message.includes('already exists') || e.message.includes('duplicate') || e.message.includes('already registered')) {
          const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.password }) });
          console.log(`Logged in ${u.username}`, !!res.token);
          tokens.push(res.token);
        } else {
          console.error(`Error with ${u.username}:`, e.message);
          throw e;
        }
      }
    }

    const [rahulToken, vikramToken, priyaToken] = tokens;
    const rahul = createClient(rahulToken);
    const vikram = createClient(vikramToken);
    const priya = createClient(priyaToken);

    // 2. Create Routes in Bangalore
    console.log('Creating routes...');
    const nandiRouteRes = await vikram.post('/api/routes', {
      title: 'Bangalore to Nandi Hills Morning Dash',
      visibility: 'public',
      geojson: {
        type: 'LineString',
        coordinates: [
          [77.5946, 12.9716], // Bangalore center
          [77.6200, 13.1000], // Yelahanka
          [77.6833, 13.3702]  // Nandi Hills
        ]
      }
    });

    const kolarRouteRes = await priya.post('/api/routes', {
      title: 'Kolar Highway Breakfast Ride (CCD)',
      visibility: 'public',
      geojson: {
        type: 'LineString',
        coordinates: [
          [77.6411, 13.0068], // KR Puram
          [77.7500, 13.0500], // Hoskote
          [78.1311, 13.1367]  // Kolar CCD
        ]
      }
    });

    const kolarRouteId = kolarRouteRes.route?.id || kolarRouteRes.id;

    // 3. Create Rides in Bangalore
    console.log('Creating group rides...');
    const now = new Date();
    const nextWeekend = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const ride1 = await vikram.post('/api/rides', {
      title: 'Sunday Morning Nandi Run',
      description: 'Classic Sunday morning ride to Nandi hills. Meet at Hebbal estem mall at 5:30 AM.',
      visibility: 'public',
      scheduled_at: nextWeekend.toISOString(),
      estimated_duration_min: 180,
      max_capacity: 50,
      start_point_coords: [77.5937, 13.0485], // Hebbal
      end_point_coords: [77.6833, 13.3702], // Nandi
      requirements: { min_experience: 'beginner', mandatory_gear: ['helmet', 'shoes'] }
    });
    const r1Id = ride1.ride?.id || ride1.id;

    const ride2 = await priya.post('/api/rides', {
      title: 'Highway Cruising to Kolar',
      description: 'A relaxed highway ride for breakfast at Kolar CCD. Open to all cruisers.',
      visibility: 'public',
      scheduled_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      estimated_duration_min: 240,
      max_capacity: 20,
      start_point_coords: [77.6411, 13.0068], // KR Puram
      end_point_coords: [78.1311, 13.1367], // Kolar
      requirements: { min_experience: 'intermediate', mandatory_gear: ['helmet', 'jacket'] }
    });
    const r2Id = ride2.ride?.id || ride2.id;

    // Join rides
    await rahul.post(`/api/rides/${r1Id}/join`);
    await rahul.post(`/api/rides/${r2Id}/join`);
    await priya.post(`/api/rides/${r1Id}/join`);

    // 4. Create Community Posts
    console.log('Creating community feed posts...');
    const post1 = await rahul.post('/api/community/posts', {
      content: 'Just got my bike serviced at Indiranagar! The chain feels silky smooth, ready for the weekend ride to Nandi.',
      visibility: 'public'
    });
    const p1Id = post1.post?.id || post1.id;

    const post2 = await vikram.post('/api/community/posts', {
      content: 'Any recommendations for a good touring jacket under 10k in Bangalore? Looking at Rynox or Viaterra. 🤔',
      visibility: 'public'
    });
    const p2Id = post2.post?.id || post2.id;

    const post3 = await priya.post('/api/community/posts', {
      content: 'Route mapped successfully for the Kolar ride. Check it out and join the pack!',
      visibility: 'public',
      route_id: kolarRouteId
    });

    // 5. Add some likes and comments
    await vikram.post(`/api/community/posts/${p1Id}/like`);
    await priya.post(`/api/community/posts/${p1Id}/like`);
    await rahul.post(`/api/community/posts/${p2Id}/like`);

    await priya.post(`/api/community/posts/${p2Id}/comments`, {
      content: 'Definitely check out the Rynox Stealth Evo. I bought mine from the HSR Layout store.'
    });

    console.log('✅ Seed complete! Your Bangalore dashboard is ready.');
  } catch (err: any) {
    console.error('❌ Seeding failed:', err.message);
  }
}

seed();
