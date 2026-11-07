(function () {
  'use strict';
  function init() {
    var root=document.querySelector('#team-canvas-root .tc-catalog');
    if(!root || !window.TeamIllustrations || root.querySelector('.tc-library-tabs')) return;
    // Keep the library close control outside the tab panels so it remains
    // available when either library is selected.
    var close=root.querySelector('.tc-library-close'); if(close)close.remove();
    var plot=document.createElement('section'); plot.id='tc-plot-library';plot.setAttribute('role','tabpanel');plot.setAttribute('aria-labelledby','tc-plots-library-tab');
    while(root.firstChild) plot.appendChild(root.firstChild);
    var tabs=document.createElement('div');tabs.className='tc-library-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Library content');
    var art=document.createElement('section');art.id='tc-illustration-library';art.hidden=true;art.setAttribute('role','tabpanel');art.setAttribute('aria-labelledby','tc-illustrations-library-tab');
    var choices=[['Plots',plot],['Illustrations',art]];
    choices.forEach(function(choice,i){var b=document.createElement('button');b.type='button';b.id=i?'tc-illustrations-library-tab':'tc-plots-library-tab';b.textContent=choice[0];b.setAttribute('role','tab');b.setAttribute('aria-controls',choice[1].id);b.setAttribute('aria-selected',String(!i));b.tabIndex=i?-1:0;tabs.appendChild(b);
      function select(){choices.forEach(function(c,j){c[1].hidden=j!==i;var t=tabs.children[j];t.setAttribute('aria-selected',String(j===i));t.tabIndex=j===i?0:-1;});}
      b.addEventListener('click',select);b.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();var next=e.key==='Home'?0:e.key==='End'?1:1-i;tabs.children[next].click();tabs.children[next].focus();}});
    });
    var heading=document.createElement('h3');heading.textContent='Scientific illustrations';
    var intro=document.createElement('p');intro.textContent='Build your study story. These are schematics, not measured data.';
    var search=document.createElement('input');search.type='search';search.className='tc-illustration-search';search.placeholder='Search illustrations';search.setAttribute('aria-label','Search illustrations');
    var list=document.createElement('div');list.className='tc-illustration-list';
    function render(){var query=search.value.trim().toLowerCase();list.replaceChildren();var hiddenComposites=['cohort-donor','workflow-overview','workflow-arrow','lipid-class-taxonomy','study-workflow-scd'];var entries=TeamIllustrations.list.filter(function(a){return hiddenComposites.indexOf(a.id)<0&&(a.title+' '+a.category).toLowerCase().includes(query);});var group='';entries.forEach(function(a){if(a.category!==group){group=a.category;var h=document.createElement('h4');h.textContent=group;list.appendChild(h);}var button=document.createElement('button');button.type='button';button.className='tc-illustration-choice';button.setAttribute('aria-label','Add illustration: '+a.title);var img=document.createElement('img');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(TeamIllustrations.svg(a.id,a.defaultColor));img.alt='';var label=document.createElement('span');label.textContent=a.title;button.append(img,label);button.addEventListener('click',function(){if(window.TeamCanvas) TeamCanvas.addIllustration(a.id);});list.appendChild(button);});if(!entries.length){var empty=document.createElement('p');empty.textContent='No illustrations match. Try a sample, cell or instrument.';list.appendChild(empty);}}
    search.addEventListener('input',render);art.append(heading,intro,search,list);if(close)root.appendChild(close);root.append(tabs,plot,art);render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
