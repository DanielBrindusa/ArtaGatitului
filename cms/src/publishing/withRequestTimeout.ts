export async function withRequestTimeout<T>(request: Promise<T>, milliseconds = 35_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(
          'GitHub authorization did not respond. Check your internet connection and try Connect GitHub again.',
        )), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
