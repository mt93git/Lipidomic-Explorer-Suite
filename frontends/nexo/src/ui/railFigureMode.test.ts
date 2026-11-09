import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {Rail} from './Rail';
import {ui} from './model';
it('marks Text & shapes selected while the Figure page is active',()=>{
 ui({figureMode:true});
 const html=renderToStaticMarkup(createElement(Rail));
 expect(html).toMatch(/aria-label="Text &amp; shapes" aria-pressed="true"/);
 ui({figureMode:false});
 expect(renderToStaticMarkup(createElement(Rail))).toMatch(/aria-label="Text &amp; shapes" aria-pressed="false"/);
});
