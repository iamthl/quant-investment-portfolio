// UTC-01: User Authentication

import bcrypt from "bcryptjs";


var mockFindUnique = jest.fn();
var mockCreate = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      create: (...args: any[]) => mockCreate(...args),
    },
  })),
}));

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

import { POST } from "@/app/api/auth/register/route";


function buildRequest(body: object): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}


describe("UTC-01: POST /api/auth/register — password hashing", () => {
  const PLAIN_TEXT_PASSWORD = "plaintext123";
  const TEST_EMAIL = "test@test.com";

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(null); // no existing user
  });

  it("should return 201 on successful registration", async () => {
    mockCreate.mockResolvedValue({
      id: "cuid-001",
      email: TEST_EMAIL,
      name: null,
      password: "$2b$10$hashedvalue",
    });

    const response = await POST(buildRequest({ email: TEST_EMAIL, password: PLAIN_TEXT_PASSWORD }));

    expect(response.status).toBe(201);
  });

  it("should not store the plain text password in the database", async () => {
    let capturedPassword: string | undefined;

    mockCreate.mockImplementation(({ data }: { data: { password: string } }) => {
      capturedPassword = data.password;
      return Promise.resolve({ id: "cuid-001", email: TEST_EMAIL, password: data.password });
    });

    await POST(buildRequest({ email: TEST_EMAIL, password: PLAIN_TEXT_PASSWORD }));

    expect(capturedPassword).toBeDefined();
    expect(capturedPassword).not.toBe(PLAIN_TEXT_PASSWORD);
  });

  it("should store a valid bcrypt hash that verifies against the original password", async () => {
    let capturedPassword: string | undefined;

    mockCreate.mockImplementation(({ data }: { data: { password: string } }) => {
      capturedPassword = data.password;
      return Promise.resolve({ id: "cuid-001", email: TEST_EMAIL, password: data.password });
    });

    await POST(buildRequest({ email: TEST_EMAIL, password: PLAIN_TEXT_PASSWORD }));

    expect(capturedPassword).toBeDefined();
    const isValid = await bcrypt.compare(PLAIN_TEXT_PASSWORD, capturedPassword!);
    expect(isValid).toBe(true);
  });

  it("should produce a bcrypt hash (starts with $2b$ or $2a$)", async () => {
    let capturedPassword: string | undefined;

    mockCreate.mockImplementation(({ data }: { data: { password: string } }) => {
      capturedPassword = data.password;
      return Promise.resolve({ id: "cuid-001", email: TEST_EMAIL, password: data.password });
    });

    await POST(buildRequest({ email: TEST_EMAIL, password: PLAIN_TEXT_PASSWORD }));

    expect(capturedPassword).toMatch(/^\$2[ab]\$\d+\$/);
  });

  it("should return 400 when email or password is missing", async () => {
    const response = await POST(buildRequest({ email: TEST_EMAIL }));
    expect(response.status).toBe(400);
  });

  it("should return 409 when the user already exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "existing", email: TEST_EMAIL });

    const response = await POST(buildRequest({ email: TEST_EMAIL, password: PLAIN_TEXT_PASSWORD }));
    expect(response.status).toBe(409);
  });
});
