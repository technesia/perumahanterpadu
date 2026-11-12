// Error domain yang aman ditampilkan ke pengguna. Error lain disamarkan.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "BAD_REQUEST",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Sesi Anda telah berakhir. Silakan masuk kembali.") {
    super(message, "UNAUTHENTICATED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Anda tidak memiliki akses untuk tindakan ini.") {
    super(message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

/** Kode status HTTP untuk error di route handler API (pesan tetap dari toActionError). */
export function httpStatusFor(e: unknown): number {
  if (e instanceof AuthenticationError) return 401;
  if (e instanceof ForbiddenError) return 403;
  if (e instanceof NotFoundError) return 404;
  if (e instanceof ConflictError) return 409;
  if (e instanceof AppError) return e.code === "RATE_LIMITED" ? 429 : 400;
  if (e instanceof Error && e.name === "ZodError") return 400;
  if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") return 409;
  return 500;
}
