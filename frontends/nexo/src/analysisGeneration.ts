const generations = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
export const analysisGeneration = (id: string) => generations.get(id) ?? 0;
export function invalidateAnalysis(id: string) {
 generations.set(id, analysisGeneration(id) + 1);
 listeners.get(id)?.forEach(listener => listener());
}
export function onAnalysisChange(id: string, listener: () => void) {
 const set = listeners.get(id) ?? new Set(); listeners.set(id, set); set.add(listener);
 return () => { set.delete(listener); };
}
/** Every science render key includes the session and its latest successful analysis PATCH. */
export function analysisCacheKey(id: string, key: unknown): string {
 return JSON.stringify([id, analysisGeneration(id), key]);
}
