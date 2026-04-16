import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 })
  }

  try {
    const history = await prisma.aIPrediction.findMany({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { timestamp: "asc" },
      take: 50 
    })

    return NextResponse.json({ history })
  } catch (error) {
    console.error("Database fetch error:", error)
    return NextResponse.json({ history: [] }) 
  }
}