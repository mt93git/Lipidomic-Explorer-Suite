import { LayoutFields } from './Fields';
import type { PlotEditorProps } from './PlotEditor';
export default function Background(p:PlotEditorProps){return <details><summary>Chart background</summary><LayoutFields {...p} keys={['paper_bgcolor','plot_bgcolor']}/></details>;}
