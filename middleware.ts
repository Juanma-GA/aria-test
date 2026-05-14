import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const SECRET = new TextEncoder().encode(JWT_SECRET);

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as {
      userId: string;
      email: string;
      role: string;
      name: string;
    };
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ['/auth/login', '/api/auth/login', '/api/health', '/api/cron/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)))
    return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon'))
    return NextResponse.next();

  const token = req.cookies.get('access_token')?.value;
  const payload = token ? await verifyToken(token) : null;

  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Use nextUrl.clone() to preserve basePath
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/auth/login';
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('access_token');
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-user-email', payload.email);
  requestHeaders.set('x-user-name', payload.name);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
