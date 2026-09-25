export class AuthorizationRequestTimeoutError extends Error {
  constructor() {
    super('GitHub authorization did not respond. Check your internet connection and try Connect GitHub again.');
    this.name = 'AuthorizationRequestTimeoutError';
  }
}

export async function withRequestTimeout<T>(request: Promise<T>, milliseconds = 35_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AuthorizationRequestTimeoutError()), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
