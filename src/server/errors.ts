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
