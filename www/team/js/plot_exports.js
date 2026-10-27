(function(){
  'use strict';
  function saveBlob(blob,name){
    var url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.style.display='none';document.body.appendChild(link);link.click();link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function plotName(widget){
    var card=widget.closest('.rd-card');
    var heading=card&&card.querySelector('h3');
    return heading?heading.textContent.trim():'plot '+widget.id;
  }
  function plotSize(gd){
    var rect=gd.getBoundingClientRect();
    var layout=gd._fullLayout||{};
    var width=Math.round(rect.width||layout.width||gd.clientWidth||0);
    var height=Math.round(rect.height||layout.height||gd.clientHeight||0);
    if(width<2||height<2)throw new Error('Plot has no exportable size');
    return {width:width,height:height};
  }
  function mountStatic(widget){
    if(!widget.id||widget.dataset.exportsMounted||widget.closest('.publication-canvas-frame'))return;
    widget.dataset.exportsMounted='true';
    var bar=document.createElement('div');bar.className='plot-export-bar';bar.setAttribute('role','group');bar.setAttribute('aria-label','Download '+plotName(widget));
    var caption=document.createElement('span');caption.textContent='Download plot · SVG/PDF contain a raster image';bar.appendChild(caption);
    var status=document.createElement('span');status.className='plot-export-status';status.setAttribute('role','status');
    ['PNG','JPG','SVG','PDF'].forEach(function(format){
      var button=document.createElement('button');button.type='button';button.className='plot-export-button';button.textContent=format;button.title=format==='SVG'||format==='PDF'?format+' export wraps the displayed raster image':'';button.setAttribute('aria-label','Download '+format+' '+plotName(widget)+(format==='SVG'||format==='PDF'?' (raster image)':''));
      button.onclick=async function(){
        var image=widget.querySelector('img');
        if(!image){status.textContent='Wait for the plot to finish loading.';return;}
        var buttons=bar.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});status.textContent='Preparing '+format+'…';
        var name='lipidomic-'+widget.id.replace(/[^a-z0-9_-]/gi,'-');
        try{
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
              pdf.addImage(png,'PNG',0,0,pageWidth,pageHeight,'','FAST');pdf.save(name+'.pdf');
            }else{
              var svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><image width="'+width+'" height="'+height+'" href="'+png+'" xlink:href="'+png+'"/></svg>';
              saveBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),name+'.svg');
            }
          }else{
            var mime=format==='JPG'?'image/jpeg':'image/png';
            var blob=await new Promise(function(resolve){canvas.toBlob(resolve,mime,format==='JPG'?.95:undefined);});
            if(!blob)throw new Error('Could not encode plot image');
            saveBlob(blob,name+(format==='JPG'?'.jpg':'.png'));
          }
          status.textContent=format+' download ready'+(format==='SVG'||format==='PDF'?' (raster image).':'.');
        }catch(error){status.textContent='Export failed. Wait for the plot to load or try PNG.';}
        finally{buttons.forEach(function(b){b.disabled=false;});}
      };bar.appendChild(button);
    });
    bar.appendChild(status);widget.before(bar);
  }
  function mount(){
    document.querySelectorAll('.shiny-plot-output').forEach(mountStatic);
    document.querySelectorAll('.plotly.html-widget-output').forEach(function(widget){
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
          var buttons=bar.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});status.textContent='Preparing '+format+'…';
          var name='lipidomic-'+widget.id.replace(/[^a-z0-9_-]/gi,'-');
          try{
            var size=plotSize(gd),width=size.width,height=size.height;
            if(format==='PDF'){
              var svg=await Plotly.toImage(gd,{format:'svg',width:width,height:height});
              var markup=decodeURIComponent(svg.slice(svg.indexOf(',')+1));
              var docSvg=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;
              if(docSvg.nodeName!=='svg')throw new Error('Invalid SVG');
              var pdf=new window.jspdf.jsPDF({orientation:width>=height?'landscape':'portrait',unit:'pt',format:[width,height]});
              await pdf.svg(docSvg,{x:0,y:0,width:width,height:height});pdf.save(name+'.pdf');
            }else{
              await Plotly.downloadImage(gd,{format:format==='JPG'?'jpeg':format.toLowerCase(),filename:name,width:width,height:height,scale:format==='SVG'?1:3});
            }
            status.textContent=format+' download ready.';
          }catch(error){status.textContent='Export failed. Please try SVG or PNG, or reload this plot.';}
          finally{buttons.forEach(function(b){b.disabled=false;});}
        };bar.appendChild(button);
      });bar.appendChild(status);widget.before(bar);
    });
  }
  function start(){mount();var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;mount();});}).observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
