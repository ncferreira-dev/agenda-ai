import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PANEL_COOKIE } from '@/lib/panel-session';

// Protege /painel/*. Presença do cookie basta pra deixar passar; a validade do
// JWT é conferida no backend a cada chamada (se expirou, getMe() manda pro login).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login, cadastro e as rotas de API do painel são públicas (precisam pra autenticar).
  if (
    pathname.startsWith('/painel/login') ||
    pathname.startsWith('/painel/registro') ||
    pathname.startsWith('/painel/esqueci-senha') ||
    pathname.startsWith('/painel/redefinir-senha') ||
    pathname.startsWith('/painel/oauth') || // callback do login social
    pathname.startsWith('/painel/api')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(PANEL_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/painel/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/painel', '/painel/:path*'],
};
