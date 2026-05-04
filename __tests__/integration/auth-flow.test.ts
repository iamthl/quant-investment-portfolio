// ITC-01: Authentication Flow

import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"

const BASE_URL      = process.env.TEST_BASE_URL ?? "http://localhost:3000"
const TEST_EMAIL    = "linh@gmail.com"
const TEST_PASSWORD = "Linh123"

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter })


async function apiPost(path: string, body: object, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  })
}

async function apiGet(path: string, cookie?: string) {
  return fetch(`${BASE_URL}${path}`, {
    method:  "GET",
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  })
}

function extractCookies(res: Response): string {
  const lines: string[] =
    typeof (res.headers as any).getSetCookie === "function"
      ? (res.headers as any).getSetCookie()
      : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/).filter(Boolean)

  return lines
    .map((line) => line.split(";")[0].trim())   // keep only name=value
    .filter(Boolean)
    .join("; ")
}

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {})
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } }).catch(() => {})
  await prisma.$disconnect()
  await pool.end()
})

describe("ITC-01: Authentication Flow - Register -> Sign-in -> Protected Route", () => {
  let sessionCookie = ""

  // Step 1 — Register
  it("POST /api/auth/register -> 201 Created", async () => {
    const res = await apiPost("/api/auth/register", {
      email:    TEST_EMAIL,
      password: TEST_PASSWORD,
      name:     "Linh",
    })
    expect(res.status).toBe(201)
  })

  it("database stores bcrypt-hashed password, not plain text", async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } })

    expect(user).not.toBeNull()
    expect(user!.password).not.toBeNull()
    expect(user!.password).not.toBe(TEST_PASSWORD)
    expect(user!.password).toMatch(/^\$2[ab]\$\d+\$/)

    const valid = await bcrypt.compare(TEST_PASSWORD, user!.password!)
    expect(valid).toBe(true)
  })

  it("POST /api/auth/signin -> 200 OK with session cookie", async () => {
    const csrfRes   = await fetch(`${BASE_URL}/api/auth/csrf`)
    const { csrfToken } = await csrfRes.json()
    const csrfCookie    = extractCookies(csrfRes)

    const res = await apiPost(
      "/api/auth/callback/credentials",
      {
        email:       TEST_EMAIL,
        password:    TEST_PASSWORD,
        csrfToken,
        callbackUrl: BASE_URL,
        json:        "true",
      },
      csrfCookie,   
    )

    expect([200, 302]).toContain(res.status)

    sessionCookie = extractCookies(res)
    expect(sessionCookie.length).toBeGreaterThan(0)
    expect(sessionCookie).toContain("next-auth.session-token")
  })

  it("GET /api/portfolio with session cookie -> 200 OK, stats.totalValue > 0", async () => {
    const res  = await apiGet("/api/portfolio", sessionCookie)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty("stats")
    expect(body.stats.totalValue).toBeGreaterThan(0)
  })

  it("GET /api/portfolio without session cookie -> 401 Unauthorised", async () => {
    const res  = await apiGet("/api/portfolio")
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.message).toMatch(/unauthorised/i)
  })
})
