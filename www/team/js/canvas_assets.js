(function () {
  'use strict';
  // Original, editable taxonomy artwork inspired by the supplied Panel A.
  // It is a schematic label map, not measured composition or a count result.
  var INK='#162230', BLUE='#2d5f8a', PALE='#eaf3f8', SAND='#f5e6c8';
  var taxonomy = [
    ['Glycerophospholipids',['Phosphatidylinositol','Phosphatidylethanolamine','Phosphatidylglycerol','Phosphatidylcholine','Cardiolipin','Phosphatidylserine','Lysophosphatidylinositol','Lysophosphatidylethanolamine','Lysophosphatidylcholine','Lysophosphatidylglycerol','Lysophosphatidylserine']],
    ['Fatty acyls',['Acylcarnitine','Phosphatidic acid','Lysophosphatidic acid']],
    ['Sphingolipids',['Ceramide','Sphingomyelin','Lactosylceramide','Glucosylceramide']],
    ['Glycerolipids',['Triacylglycerol','Diacylglycerol']],
    ['Sterols',['Cholesteryl ester']]
  ];
  function esc(x){return String(x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c];});}
  function validColor(x){return typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x);}
  function svg(id,color){
    if(id==='study-workflow-scd')return workflow(color);
    if(id!=='lipid-class-taxonomy')throw new Error('Unknown Team canvas asset: '+id);
    color=color===undefined?BLUE:color;if(!validColor(color))throw new Error('Asset color must be a six-digit hex value.');
    var families=[
      ['Glycerophospholipids',[['PI','#a76a9f'],['PE','#c87944'],['PG','#777c85'],['PC','#48699d'],['CL','#ce9b42'],['PS','#7b5b91'],['LPE','#4a949e'],['LPC','#b15c62'],['LPI','#c6a544'],['LPG','#805e9d'],['LPS','#b4748d'],['PA','#639b9f'],['LPA','#c57a9b']]],
      ['Fatty acyls',[['Acylcarnitine','#7b9e71']]],['Sphingolipids',[['Ceramide','#b79b45'],['Sphingomyelin','#8b7362'],['Lactosylceramide','#62729f'],['Glucosylceramide','#807568']]],
      ['Glycerolipids',[['Triacylglycerol','#4f8a75'],['Diacylglycerol','#4487a3']]],['Sterols',[['Cholesteryl ester','#b95755']]]
    ];
    var out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 380" role="img" aria-label="Lipid class taxonomy" data-team-illustration-version="1" data-team-illustration-kind="schematic-taxonomy"><title>Global Lipidomics · common lipid classes</title><desc>Schematic class reference, not measured composition. PI phosphatidylinositol; PE phosphatidylethanolamine; PG phosphatidylglycerol; PC phosphatidylcholine; CL cardiolipin; PS phosphatidylserine; L prefix lyso; PA phosphatidic acid. No counts are implied.</desc><g font-family="Arial, Helvetica, sans-serif" fill="#202020">';
    out+='<text x="490" y="29" text-anchor="middle" font-size="23" font-weight="700">Global Lipidomics</text><text x="490" y="58" text-anchor="middle" font-size="19">Glycerophospholipids</text>';
    families[0][1].forEach(function(chip,i){var x=20+(i%7)*136,y=74+Math.floor(i/7)*49;out+='<rect data-chip="true" x="'+x+'" y="'+y+'" width="124" height="39" rx="2" fill="'+chip[1]+'"/><text x="'+(x+62)+'" y="'+(y+26)+'" text-anchor="middle" font-size="21" font-weight="600" fill="#fff">'+chip[0]+'</text>';});
    families.slice(1).forEach(function(family,i){var x=20+i*240;out+='<text x="'+(x+111)+'" y="206" text-anchor="middle" font-size="19" font-weight="700">'+family[0]+'</text>';family[1].forEach(function(chip,j){var y=220+j*36;out+='<rect data-chip="true" x="'+x+'" y="'+y+'" width="222" height="30" rx="2" fill="'+chip[1]+'"/><text x="'+(x+111)+'" y="'+(y+21)+'" text-anchor="middle" font-size="16" fill="#fff">'+chip[0]+'</text>';});});
    return out+'</g></svg>';
  }

  function workflow(color){
    color=color===undefined?BLUE:color;if(!validColor(color))throw new Error('Asset color must be a six-digit hex value.');
    function person(x,y,c){return '<g transform="translate('+x+' '+y+')" fill="'+c+'" stroke="#222" stroke-width="1.3"><circle cx="12" cy="9" r="7"/><path d="M4 20h16l4 27h-7v28h-10V47H0z"/></g>';}
    function arrow(x,y){return '<path d="M'+x+' '+y+'h42m-9-7 9 7-9 7" fill="none" stroke="#222" stroke-width="3"/>';}
    var out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" role="img" aria-label="Three-cohort serum lipidomics workflow" data-team-illustration-version="1" data-team-illustration-kind="schematic-not-to-scale"><title>Three-cohort serum lipidomics workflow</title><desc>Illustrative study workflow for Healthy, Steady State and Pain Crisis cohorts. No sample counts or instrument identity are asserted. Not to scale.</desc><g font-family="Arial, Helvetica, sans-serif" fill="#202020">';
    [['Healthy','#b7b7b7',22],['Steady State','#377eb8',116],['Pain Crisis','#d82332',210]].forEach(function(row){out+=person(30,row[2],row[1])+person(62,row[2],row[1])+'<text x="106" y="'+(row[2]+45)+'" font-size="23">'+row[0]+'</text>';});
    out+='<path d="M273 65h16v188h-16M289 158h34" fill="none" stroke="#222" stroke-width="2"/>'+arrow(323,158);
    out+='<path d="M410 70c-8 33-43 61-43 96a43 43 0 0 0 86 0c0-35-35-63-43-96Z" fill="#d82332"/><path d="M391 165c0 18 11 29 26 29" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><text x="410" y="246" text-anchor="middle" font-size="23">Whole blood</text>'+arrow(470,158);
    out+='<rect x="551" y="65" width="45" height="29" rx="4" fill="#c96b37"/><path d="M555 94h37v112q-18 25-37 0z" fill="#f7f1df" stroke="#555" stroke-width="2"/><path d="M560 133h27v70q-13 17-27 0z" fill="#e7c969"/><rect x="560" y="109" width="27" height="17" fill="#fff"/><text x="574" y="246" text-anchor="middle" font-size="23">Serum</text>'+arrow(625,158);
    out+='<rect x="707" y="78" width="90" height="131" rx="4" fill="#253746"/><rect x="799" y="98" width="78" height="111" rx="4" fill="#dce6eb" stroke="#526779" stroke-width="2"/><rect x="879" y="110" width="62" height="99" rx="4" fill="#87bbcf" stroke="#526779" stroke-width="2"/><rect x="720" y="93" width="63" height="32" rx="2" fill="#82aabf"/><path d="M720 148h62M720 164h62M720 181h62M813 122h49M813 140h49M897 131v57" stroke="#fff" stroke-width="3"/><text x="824" y="246" text-anchor="middle" font-size="23">Global lipidomics</text><text x="824" y="274" text-anchor="middle" font-size="17" fill="#555">LC–MS · schematic</text>';
    return out+'</g></svg>';
  }
  window.TeamCanvasAssets={version:'1',list:[{id:'lipid-class-taxonomy',title:'Lipid class taxonomy',category:'Lipidomics context',description:'Editable schematic class map inspired by Panel A; no measured counts. Recommended minimum canvas width: 490 pt.'},{id:'study-workflow-scd',title:'Three-cohort serum workflow',category:'Study design',description:'Healthy, Steady State and Pain Crisis study schematic; no measured counts or specific instrument identity.'}],svg:svg};
}());
