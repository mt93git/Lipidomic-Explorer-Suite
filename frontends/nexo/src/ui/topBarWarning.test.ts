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
// FIX-PROD-C 2: the limit is Team's (R/frontends/team/project_records.R team_project_records_node_limit, enforced when
// Team saves). Nexo carries the records unchanged, so its own saves keep working: the pill's title says what it means
// for this board and what to do, in one sentence.
it('the records warning says the limit is Team\'s, that Nexo keeps saving, and what to do', () => {
  const help = strings.recordsNearLimitHelp;
  expect(help).toMatch(/Team/);
  expect(help).toMatch(/Nexo keeps saving/);
  expect(help).toMatch(/Download ZIP/);
  expect(help.split(/[.;:] /).length).toBe(1);
});
