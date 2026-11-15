import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HelpDialog } from './HelpDialog';
import { strings } from '../strings';
it('explains arranging, finished plots, downloads and checkpoint saving independently of shortcuts', () => {
  const html=renderToStaticMarkup(createElement(HelpDialog,{onClose:()=>{}}));
  for (const text of [strings.help,strings.helpArrangeText,strings.helpFinishText,strings.helpSaveText]) expect(html).toContain(text);
  expect(html).not.toContain(strings.shortcutsTitle);
});
