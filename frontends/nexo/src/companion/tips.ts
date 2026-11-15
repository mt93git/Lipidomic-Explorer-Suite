import type { Screen } from './model';
/** Per-screen tips. Data, Review and Canvas are copied verbatim from Team's reviewed guidance,
 *  www/team/js/companion_guidance_data.js (analyst branch, `tips`: data-metadata, review, canvas). Start keeps Team's
 *  title (data-choice) in Nexo's Home words (ui/entry/StartScreen.tsx: Continue, Open, Prepare): Team's text names its
 *  own "Open latest" and new matrix, which Nexo's Home does not have.
 *  Team has no Inspector entry: that tip and the welcome bubble are the approved prototype's text
 *  (docs/integration/nexo-companion/prototype.html). */
export const tips: Record<Screen, { title: string; text: string }> = {
  start: { title: 'Choose how to begin', text: 'Continue where you left off or open a project. To start a new one, prepare a released dataset.' },
  data: { title: 'Add sample labels', text: 'Check that each sample has the right group. If the same participant appears more than once, record it: repeated participants change which tests are valid.' },
  review: { title: 'Review your data', text: 'Move the detection slider to keep lipids measured in enough samples; the PCA updates. Click a point to inspect a sample before excluding it.' },
  canvas: { title: 'Arrange your plots', text: 'Select a card to style it, read its data, or ask me to explain it. Finished plots go into the figure page.' },
  inspector: { title: 'Statistics', text: 'Choose PC1, the groups and the test, then Plot on canvas to add the PCA score figure with its group table.' },
};
export const welcome = { title: "Hi, I'm your lab guide", text: "Open a saved board or upload a matrix to start. I'll stay nearby; click me any time." };
