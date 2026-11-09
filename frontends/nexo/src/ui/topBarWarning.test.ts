import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TopBar } from './TopBar';
import { strings } from './strings';
it('keeps the checkpoint records warning visible beside save status', () => {
  const props = {projectName:'Synthetic',onCheckpoints:()=>{},saveText:'Saved',saveStatus:'saved'};
  expect(renderToStaticMarkup(createElement(TopBar,{...props,nearLimit:true}))).toContain(strings.recordsNearLimitHelp);
  expect(renderToStaticMarkup(createElement(TopBar,props))).not.toContain(strings.recordsNearLimit);
});
