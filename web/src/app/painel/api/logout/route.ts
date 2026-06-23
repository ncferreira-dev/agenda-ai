import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PANEL_COOKIE } from '@/lib/panel-session';

export async function POST() {
  cookies().delete(PANEL_COOKIE);
  return NextResponse.json({ ok: true });
}
