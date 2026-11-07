// W3A: hold each workspace status text for at least HOLD_MS before it is
// replaced or cleared. Shiny busy/idle cycles rewrite #tw-next many times per
// second; only the latest wanted text is shown once the hold ends, so the line
// (and its polite live region) never blinks faster than about once a second.
(function(){'use strict';
 var HOLD_MS=1000;
 function now(){return window.performance&&performance.now?performance.now():Date.now();}
 function hold(el){return el.__twStatusHold||(el.__twStatusHold={shownAt:-Infinity,timer:0,target:el.textContent});}
 function commit(el,s){
  s.timer=0;if(el.textContent===s.target)return;
  el.textContent=s.target;s.shownAt=now();
  if(s.target)el.title=s.target;else el.removeAttribute('title');
 }
 // urgent: the result of a user action (a refused step, a cancel). It is written at once, as in
 // production, and then held like any other text, so a routine repaint cannot discard it unseen.
 function set(el,text,urgent){
  if(!el)return;var s=hold(el);s.target=text==null?'':String(text);
  if(urgent){if(s.timer){clearTimeout(s.timer);s.timer=0;}if(el.textContent!==s.target)commit(el,s);else s.shownAt=now();return;}
  if(el.textContent===s.target){if(s.timer){clearTimeout(s.timer);s.timer=0;}return;}
  if(s.timer)return; // the pending commit picks up the latest target
  var wait=s.shownAt+HOLD_MS-now();
  if(wait<=0)commit(el,s);else s.timer=setTimeout(function(){commit(el,s);},wait);
 }
 // The text the page wants now, even while the visible text is still held.
 function target(el){return el?(el.__twStatusHold?el.__twStatusHold.target:el.textContent):'';}
 window.TeamStatusHold={set:set,target:target,HOLD_MS:HOLD_MS};
})();
