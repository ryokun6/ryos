import { NextRequest, NextResponse } from 'next/server';

// In-memory user store for mock mode
const users = new Map();

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const body = await request.json();

    if (action === 'createUser') {
      const { username, password } = body;

      if (!username || !password) {
        return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
      }

      const lower = username.toLowerCase();
      if (users.has(lower)) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }

      const token = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const user = { username: lower, createdAt: Date.now() };
      users.set(lower, { ...user, password, token });

      return NextResponse.json({ ok: true, user, token }, { status: 201 });
    }

    if (action === 'authenticateWithPassword') {
      const { username, password } = body;

      if (!username || !password) {
        return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
      }

      const lower = username.toLowerCase();
      const entry = users.get(lower);

      if (!entry || entry.password !== password) {
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }

      const token = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      entry.token = token;

      return NextResponse.json({ ok: true, username: lower, token }, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'verifyToken') {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.replace(/^Bearer\s+/i, '') || null;
      const found = [...users.values()].find((u) => u.token === token);

      return NextResponse.json({ valid: !!found }, { status: found ? 200 : 401 });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}