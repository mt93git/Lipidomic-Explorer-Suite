"use server";
import { revalidatePath } from "next/cache";
import { acceptResultFile, compareWithPreviousFile, parseResultFile } from "@/lib/data/results";
export async function parseUpload(form: FormData) {
  try { return { review: await parseResultFile(form) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Upload failed." }; }
}
export async function acceptUpload(id: string, reason: string) {
  try {
    const accepted = await acceptResultFile(id, reason);
    revalidatePath("/ingest-results");
    return { accepted };
  } catch (error) { return { error: error instanceof Error ? error.message : "Acceptance failed." }; }
}
export async function compareUpload(id: string) {
  try { return { comparison: await compareWithPreviousFile(id) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Comparison failed." }; }
}
