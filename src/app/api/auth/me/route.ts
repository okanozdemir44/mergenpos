import { NextResponse } from "next/server";
import { getSessionCookie, verifyToken } from "@/lib/auth";

export async function GET() {
  const token = await getSessionCookie();
  
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const payload = await verifyToken(token);
  
  if (!payload) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: payload });
}
