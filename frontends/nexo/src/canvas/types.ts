import type { Rect } from '../tiers';
export type Box = Rect & { id: string };
export interface Move { id: string; x: number; y: number }
