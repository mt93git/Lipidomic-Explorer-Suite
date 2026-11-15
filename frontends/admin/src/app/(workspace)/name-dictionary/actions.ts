"use server";
import { revalidatePath } from "next/cache";
import { approveNameProposals, importNameList, saveNameEntry } from "@/lib/data/results";
export async function saveDictionaryEntry(_previous: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    await saveNameEntry(form);
    revalidatePath("/name-dictionary");
    return { saved: true };
  } catch (error) { return { error: error instanceof Error ? error.message : "Save failed." }; }
}
export async function approveProposals(exportNames: string[]): Promise<{ error?: string; added?: number }> {
  try {
    const { added } = await approveNameProposals(exportNames);
    revalidatePath("/name-dictionary");
    return { added };
  } catch (error) { return { error: error instanceof Error ? error.message : "Approval failed." }; }
}
export async function importList(_previous: { error?: string; added?: number; existing?: number; skipped?: string[] }, form: FormData): Promise<{ error?: string; added?: number; existing?: number; skipped?: string[] }> {
  try {
    const result = await importNameList(form);
    revalidatePath("/name-dictionary");
    return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Import failed." }; }
}
