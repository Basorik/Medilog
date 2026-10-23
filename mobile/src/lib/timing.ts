/** Runs `work`, but resolves no sooner than `ms`, so quick on-device results still read as deliberate. */
export async function atLeast<T>(ms: number, work: () => Promise<T>): Promise<T> {
  const [result] = await Promise.all([work(), new Promise((r) => setTimeout(r, ms))]);
  return result;
}
