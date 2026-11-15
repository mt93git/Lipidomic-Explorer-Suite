// Track only objects written by this attempt. Existing identical objects belong to earlier calls.
// Storage policies protect recorded files if the database committed despite a transport error.
export async function uploadThenRecord<T, F extends { path: string }>(
  files: F[], upload: (file: F) => Promise<boolean>, remove: (paths: string[]) => Promise<unknown>, record: () => Promise<T>,
): Promise<T> {
  const written: string[] = [];
  try {
    for (const file of files) if (await upload(file)) written.push(file.path);
    return await record();
  } catch (error) {
    if (written.length) { try { await remove(written); } catch { /* Preserve the recording error. */ } }
    throw error;
  }
}
