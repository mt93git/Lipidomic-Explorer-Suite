(function(){
  'use strict';
  // Standard PDF fonts cannot encode Plotly's U+2212. Normalize only a
  // detached SVG copy so screen and SVG exports retain their original text.
  function installPdfMinusFix(){
    var api=window.jspdf&&window.jspdf.jsPDF&&window.jspdf.jsPDF.API;
    if(!api||!api.svg||api.__plotAsciiMinus)return;
    var original=api.svg;
    api.svg=function(element,options){
      var copy=element.cloneNode(true),walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT),node;
      while((node=walker.nextNode()))node.nodeValue=node.nodeValue.replace(/\u2212/g,'-');
      return original.call(this,copy,options);
    };
    api.__plotAsciiMinus=true;
  }
  window.TeamPdf=window.TeamPdf||{};
  window.TeamPdf.ensureMinusFix=installPdfMinusFix;
  installPdfMinusFix();
  function visiblePlot(widget){
    var plots=Array.prototype.slice.call(widget.querySelectorAll('.js-plotly-plot'));
    if(widget.classList.contains('js-plotly-plot'))plots.unshift(widget);
    for(var i=plots.length-1;i>=0;i--){
      var gd=plots[i],style=getComputedStyle(gd);
      if(gd.data&&style.display!=='none'&&style.visibility!=='hidden'&&gd.getClientRects().length)return gd;
    }
    return null;
  }
  // token: the Canvas card's revision when the export started (TeamCanvas.exportRevision); the
  // file is published only if it is unchanged. Returns false when the export was dropped.
  async function exportPlot(gd,format,name,bar,token){
    // Test mode (canvas.js lazy mount): throws if gd is a Canvas card not mounted and clean.
    if(window.TeamCanvas&&typeof window.TeamCanvas.assertClean==='function')window.TeamCanvas.assertClean(gd);
    var size=plotSize(gd),width=size.width,height=size.height;
    if(format==='PDF'){
      installPdfMinusFix();
      if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF export library is unavailable');
      var svg=await Plotly.toImage(gd,{format:'svg',width:width,height:height});
      var markup=decodeURIComponent(svg.slice(svg.indexOf(',')+1));
      var docSvg=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;
      if(docSvg.nodeName!=='svg')throw new Error('Invalid SVG');
      var pdf=new window.jspdf.jsPDF({orientation:width>=height?'landscape':'portrait',unit:'pt',format:[width,height]});
      await pdf.svg(docSvg,{x:0,y:0,width:width,height:height});
      return saveBlob(pdf.output('blob'),name+'.pdf',bar,token);
    }else{
      var imageUrl=await Plotly.toImage(gd,{format:format==='JPG'?'jpeg':format.toLowerCase(),width:width,height:height,scale:format==='SVG'?1:Math.min(3,30000/width,30000/height)});
      var imageBlob=await (await fetch(imageUrl)).blob();
      return saveBlob(imageBlob,name+(format==='JPG'?'.jpg':'.'+format.toLowerCase()),bar,token);
    }
  }
  function saveBlob(blob,name,bar,token){
    if(token&&window.TeamCanvas&&typeof window.TeamCanvas.exportCurrent==='function'&&!window.TeamCanvas.exportCurrent(token)){
      var st=bar.querySelector('.plot-export-status');if(st)st.textContent='Plot changed \u2014 export again.';return false;
    }
    var old=bar.querySelector('.plot-export-fallback');
    if(old){URL.revokeObjectURL(old.href);old.remove();}
    var url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;if(token){link.dataset.cardId=token.cardId;link.dataset.revision=token.revision;}link.textContent='Save '+name.split('.').pop().toUpperCase()+' file';link.className='plot-export-fallback plot-export-button';
    // Keep a real, accessible user-clickable link beside this plot. Browser
    // policy may suppress automatic downloads after asynchronous rendering.
    bar.appendChild(link);link.click();
    setTimeout(function(){link.remove();URL.revokeObjectURL(url);},600000);
    return true;
  }
  function plotName(widget){
    var card=widget.closest('.rd-card');
    var heading=card&&card.querySelector('h3');
    return heading?heading.textContent.trim():'plot '+widget.id;
  }
  function plotSize(gd){
    var rect=gd.getBoundingClientRect();
    var layout=gd._fullLayout||{};
    var inCanvas=!!gd.closest('.tc-node');
    var viewScale=inCanvas&&window.TeamCanvasViewport&&Number(window.TeamCanvasViewport.scale)>0?Number(window.TeamCanvasViewport.scale):1;
    var computed=inCanvas?getComputedStyle(gd):null;
    // Canvas zoom is a viewport transform, not a change to the plot's logical
    // dimensions. Keep live exports at the same intrinsic size as Finish.
    var width=Math.round(inCanvas?(gd.clientWidth||parseFloat(computed.width)||rect.width/viewScale):(rect.width||layout.width||gd.clientWidth||0));
    var height=Math.round(inCanvas?(gd.clientHeight||parseFloat(computed.height)||rect.height/viewScale):(rect.height||layout.height||gd.clientHeight||0));
    if(width<2||height<2)throw new Error('Plot has no exportable size');
    return {width:width,height:height};
  }
  function mountStatic(widget){
    if(!widget.id||widget.closest('.publication-canvas-frame'))return;
    if(widget.dataset.exportsMounted){
      var existing=widget.previousElementSibling,active=visiblePlot(widget);
      if(existing&&existing.classList.contains('plot-export-bar')){
        var caption=existing.querySelector('span'),captionText=active?'Download plot · as shown':'Download plot · SVG/PDF contain a raster image';
        if(caption.textContent!==captionText)caption.textContent=captionText;
        // Write only real changes: this runs on every DOM change in the page.
        existing.querySelectorAll('button').forEach(function(button){var f=button.textContent,title=active?'':(f==='SVG'||f==='PDF'?f+' export wraps the displayed raster image':''),label='Download '+f+' '+plotName(widget)+(!active&&(f==='SVG'||f==='PDF')?' (raster image)':'');if(button.title!==title)button.title=title;if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);});
      }
      return;
    }
    widget.dataset.exportsMounted='true';
    var bar=document.createElement('div');bar.className='plot-export-bar';bar.setAttribute('role','group');bar.setAttribute('aria-label','Download '+plotName(widget));
    var caption=document.createElement('span');caption.textContent='Download plot · SVG/PDF contain a raster image';bar.appendChild(caption);
    var status=document.createElement('span');status.className='plot-export-status';status.setAttribute('role','status');
    ['PNG','JPG','SVG','PDF'].forEach(function(format){
      var button=document.createElement('button');button.type='button';button.className='plot-export-button';button.textContent=format;button.title=format==='SVG'||format==='PDF'?format+' export wraps the displayed raster image':'';button.setAttribute('aria-label','Download '+format+' '+plotName(widget)+(format==='SVG'||format==='PDF'?' (raster image)':''));
      button.onclick=async function(){
        var gd=visiblePlot(widget),image=widget.querySelector('img');
        if(!gd&&!image){status.textContent='Wait for the plot to finish loading.';return;}
        var token=window.TeamCanvas&&typeof window.TeamCanvas.exportRevision==='function'?window.TeamCanvas.exportRevision(widget):null;var buttons=bar.querySelectorAll('button:not(.ts-export-trigger)');buttons.forEach(function(b){b.disabled=true;});status.textContent='Preparing '+format+'…';
        var name='lipidomic-'+widget.id.replace(/[^a-z0-9_-]/gi,'-');
        try{
          if(gd&&window.Plotly){
            if(await exportPlot(gd,format,name,bar,token))status.textContent=format+' is ready. If the download did not start, use Save '+format+' file.';
            return;
          }
          if(gd)throw new Error('Plotly is unavailable');
          if(image.decode)await image.decode();
          var width=image.naturalWidth,height=image.naturalHeight;
          if(!image.complete||!width||!height)throw new Error('Plot image is not ready');
          var canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          var context=canvas.getContext('2d');if(!context)throw new Error('Canvas is unavailable');
          context.fillStyle='#ffffff';context.fillRect(0,0,width,height);
          context.drawImage(image,0,0,width,height);
          if(format==='PDF'||format==='SVG'){
            var png=canvas.toDataURL('image/png');
            if(format==='PDF'){
              if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF export library is unavailable');
              var pageWidth=width*.75,pageHeight=height*.75;
              var pdf=new window.jspdf.jsPDF({orientation:width>=height?'landscape':'portrait',unit:'pt',format:[pageWidth,pageHeight]});
              pdf.addImage(png,'PNG',0,0,pageWidth,pageHeight,'','FAST');var saved=saveBlob(pdf.output('blob'),name+'.pdf',bar,token);
            }else{
              var svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><image width="'+width+'" height="'+height+'" href="'+png+'" xlink:href="'+png+'"/></svg>';
              var saved=saveBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),name+'.svg',bar,token);
            }
          }else{
            var mime=format==='JPG'?'image/jpeg':'image/png';
            var blob=await new Promise(function(resolve){canvas.toBlob(resolve,mime,format==='JPG'?.95:undefined);});
            if(!blob)throw new Error('Could not encode plot image');
            var saved=saveBlob(blob,name+(format==='JPG'?'.jpg':'.png'),bar,token);
          }
          if(saved)status.textContent=format+' download ready'+(format==='SVG'||format==='PDF'?' (raster image).':'.');
        }catch(error){status.textContent='Export failed. Wait for the plot to load or try PNG.';}
        finally{buttons.forEach(function(b){b.disabled=false;});}
      };bar.appendChild(button);
    });
    bar.appendChild(status);widget.before(bar);
  }
  function mount(){
    document.querySelectorAll('.shiny-plot-output').forEach(mountStatic);
    // A Canvas copy waiting to mount (canvas.js lazy mount) keeps its bar: its exports mount it first.
    document.querySelectorAll('.plotly.html-widget-output,.plotly.tc-lazy-unbound').forEach(function(widget){
      if(!widget.id||widget.dataset.exportsMounted)return;
      widget.dataset.exportsMounted='true';
      var bar=document.createElement('div');bar.className='plot-export-bar';bar.setAttribute('role','group');bar.setAttribute('aria-label','Download '+plotName(widget));
      var caption=document.createElement('span');caption.textContent='Download plot';bar.appendChild(caption);
      var status=document.createElement('span');status.className='plot-export-status';status.setAttribute('role','status');
      ['PNG','SVG','PDF','JPG'].forEach(function(format){
        var button=document.createElement('button');button.type='button';button.className='plot-export-button';button.textContent=format;button.setAttribute('aria-label','Download '+format+' '+plotName(widget));
        button.onclick=async function(){
          var gd=widget.classList.contains('js-plotly-plot')?widget:widget.querySelector('.js-plotly-plot');
          if(!gd||!gd.data||!window.Plotly){status.textContent='Wait for the plot to finish loading.';return;}
          var token=window.TeamCanvas&&typeof window.TeamCanvas.exportRevision==='function'?window.TeamCanvas.exportRevision(widget):null;var buttons=bar.querySelectorAll('button:not(.ts-export-trigger)');buttons.forEach(function(b){b.disabled=true;});status.textContent='Preparing '+format+'…';
          var name='lipidomic-'+widget.id.replace(/[^a-z0-9_-]/gi,'-');
          try{
            if(await exportPlot(gd,format,name,bar,token))status.textContent=format+' is ready. If the download did not start, use Save '+format+' file.';
          }catch(error){status.textContent='Export failed. Please try SVG or PNG, or reload this plot.';}
          finally{buttons.forEach(function(b){b.disabled=false;});}
        };bar.appendChild(button);
      });bar.appendChild(status);widget.before(bar);
    });
  }
  function start(){mount();var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;mount();});}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
