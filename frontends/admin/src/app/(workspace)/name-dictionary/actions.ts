"use server";
import { revalidatePath } from "next/cache";
import { saveNameEntry } from "@/lib/data/results";
export async function saveDictionaryEntry(_previous: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    await saveNameEntry(form);
    revalidatePath("/name-dictionary");
    return { saved: true };
  } catch (error) { return { error: error instanceof Error ? error.message : "Save failed." }; }
}
