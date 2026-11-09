// temporary; replace by document.ts imports when it lands
export interface Node { id: string; x: number; y: number; width: number; height: number; label: string }
export interface CanvasState { nodes: Node[]; nexo?: import('./nexo').Nexo }
