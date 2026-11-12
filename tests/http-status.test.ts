import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, AuthenticationError, ConflictError, ForbiddenError, httpStatusFor, NotFoundError } from "@/server/errors";

describe("Kode status HTTP untuk error API", () => {
  it("memetakan jenis error ke status yang tepat", () => {
    expect(httpStatusFor(new AuthenticationError())).toBe(401);
    expect(httpStatusFor(new ForbiddenError())).toBe(403);
    expect(httpStatusFor(new NotFoundError())).toBe(404);
    expect(httpStatusFor(new ConflictError("bentrok"))).toBe(409);
    expect(httpStatusFor(new AppError("Terlalu banyak percobaan", "RATE_LIMITED"))).toBe(429);
    expect(httpStatusFor(new AppError("input salah", "VALIDATION"))).toBe(400);
    expect(httpStatusFor(z.string().safeParse(1).error)).toBe(400);
    expect(httpStatusFor(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }))).toBe(409);
    expect(httpStatusFor(new Error("internal"))).toBe(500);
  });
});
