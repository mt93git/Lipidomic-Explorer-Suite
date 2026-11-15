// @ts-nocheck
// Original Team SVG generators, ported without changing artwork.
const window = {} as any;
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

(function () {
  'use strict';

  /*
   * Small, original SVG illustrations for the Team canvas. They are visual
   * annotations for a workflow, never a claim about measured anatomy. Each
   * asset uses the same 240 × 160 board so the palette can place them without
   * reflowing the finished figure.
   */
  var INK = '#162230';
  var BLUE = '#2d5f8a';
  var PALE = '#eaf3f8';
  var MINT = '#dbeaf2';
  var SAND = '#f5e6c8';
  var RED = '#c94b4b';
  var assets = [
    ['cohort-donor', 'Cohort donor', 'Study design', 'cohort'],
    ['whole-blood', 'Whole blood', 'Sample collection', 'blood'],
    ['serum-vial', 'Serum / plasma vial', 'Sample preparation', 'vial'],
    ['pipette', 'Pipette transfer', 'Sample preparation', 'pipette'],
    ['microplate', '96-well plate', 'Sample preparation', 'plate'],
    ['extraction-tubes', 'Extraction tubes', 'Sample preparation', 'tubes'],
    ['centrifuge', 'Centrifuge', 'Sample preparation', 'centrifuge'],
    ['cold-storage', 'Cold storage', 'Sample handling', 'freezer'],
    ['lc-ms', 'LC–MS instrument', 'Acquisition', 'instrument'],
    ['lipid-bilayer', 'Lipid bilayer', 'Lipidomics context', 'bilayer'],
    ['neutrophil', 'Neutrophil (conceptual)', 'Cell context', 'neutrophil'],
    ['macrophage', 'Macrophage (conceptual)', 'Cell context', 'macrophage'],
    ['workflow-arrow', 'Workflow connector', 'Composition', 'arrow'],
    ['workflow-overview', 'Workflow overview', 'Composition', 'overview'],
    ['donor-person', 'Donor / participant', 'Study components', 'person'],
    ['cohort-label', 'Cohort label', 'Study components', 'cohortLabel'],
    ['connector-arrow', 'Connector arrow', 'Composition', 'connector'],
    ['lipid-class-chip', 'Lipid class chip', 'Lipidomics context', 'classChip'],
    ['sample-vial-component', 'Sample vial component', 'Sample components', 'vialComponent']
  ].map(function (a) { return { id: a[0], title: a[1], category: a[2], kind: a[3], defaultColor: a[3] === 'blood' ? '#ad2939' : (['vial','vialComponent'].indexOf(a[3]) >= 0 ? '#df8d32' : (['arrow','connector','cohort','person'].indexOf(a[3]) >= 0 ? '#232b35' : BLUE)) }; });

  var shapes = {
    cohort: '<g fill="#2d5f8a" stroke="none"><circle cx="100" cy="28" r="9"/><path d="M91 42Q100 38 109 42L116 75Q116 80 112 80Q109 80 108 76L105 59V92L106 138Q106 143 101 143Q97 143 97 138L95 98L93 138Q93 143 88 143Q84 143 84 138L85 91V59L82 76Q81 80 77 79Q74 78 75 74L82 45Q84 41 91 42Z"/><circle cx="147" cy="28" r="9"/><path d="M139 42Q147 39 155 42L167 74Q169 80 164 81Q160 82 158 76L153 62L162 103H154L153 138Q153 143 149 143Q145 143 145 138L144 107L141 138Q141 143 137 143Q133 143 133 138L134 103H125L138 61L130 78Q128 82 124 80Q120 79 122 74L133 46Q135 42 139 42Z"/></g>',
    blood: '<path d="M120 16C113 35 87 62 87 91C87 132 153 132 153 91C153 62 127 35 120 16Z" fill="#2d5f8a" stroke="none"/><path d="M106 58C95 76 94 93 103 103C98 83 105 72 110 62Z" fill="#ffffff" opacity=".8" stroke="none"/>',
    vial: '<g stroke="#889198" stroke-width="1.2"><path d="M104 30H136V134Q136 145 120 145Q104 145 104 134Z" fill="#f1f5f6"/><path d="M108 56H132V108H108Z" fill="#f5d780" stroke="none"/><path d="M108 108H132V133Q132 141 120 141Q108 141 108 133Z" fill="#a32f38" stroke="none"/><path d="M108 108H132" stroke="#842730"/><path d="M107 37V129" stroke="#ffffff" stroke-width="3"/><path d="M135 38V132" stroke="#cad2d5"/><rect x="100" y="15" width="40" height="22" rx="3" fill="#2d5f8a" stroke="#a96b2c"/><path d="M105 18V33" stroke="#f6b95c"/><path d="M110 18V33" stroke="#f6b95c"/><path d="M115 18V33" stroke="#f6b95c"/><path d="M120 18V33" stroke="#f6b95c"/><path d="M125 18V33" stroke="#f6b95c"/><path d="M130 18V33" stroke="#f6b95c"/><path d="M135 18V33" stroke="#f6b95c"/><path d="M101 36H139" stroke="#b9742c"/></g>',
    pipette: '<path d="M53 42 143 108l-10 10L43 52z"/><path d="m43 52-13 13 11 11 12-13M142 107l18 18"/><path d="M83 64 96 51"/>',
    plate: '<rect x="42" y="27" width="156" height="106" rx="8"/><g fill="' + PALE + '">' + Array.from({length: 96}, function (_, i) { var x = 53 + (i % 12) * 12.4, y = 40 + Math.floor(i / 12) * 11.4; return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5"/>'; }).join('') + '</g>',
    tubes: '<path d="M54 34h28v82a14 14 0 0 1-28 0zM106 34h28v82a14 14 0 0 1-28 0zM158 34h28v82a14 14 0 0 1-28 0z"/><path d="M54 69h28M106 69h28M158 69h28" stroke="' + SAND + '" stroke-width="12"/>',
    centrifuge: '<circle cx="120" cy="83" r="52" fill="' + PALE + '"/><circle cx="120" cy="83" r="11"/><path d="M120 72 92 49l-7 10 27 28M130 83l31-3-1 13-31 1M120 94l14 29-12 4-11-30"/><path d="M64 131h112"/>',
    freezer: '<rect x="57" y="22" width="126" height="112" rx="7"/><path d="M57 64h126M120 22v42"/><path d="M84 89h20M84 106h20M138 88h20M138 105h20"/><circle cx="119" cy="98" r="17" fill="' + PALE + '"/><path d="M119 88v20M109 98h20"/>',
    instrument: '<g stroke="#74818a" stroke-width="1"><path d="M23 136H219L225 143H22Z" fill="#d9dfe2" stroke="none"/><rect x="27" y="28" width="49" height="108" rx="2" fill="#303b46"/><rect x="31" y="34" width="41" height="22" rx="1" fill="#424f5b"/><path d="M34 52H68" stroke="#71808b"/><rect x="35" y="38" width="14" height="6" fill="#83b2c3" stroke="none"/><circle cx="65" cy="41" r="1.4" fill="#d8e6e8" stroke="none"/><rect x="31" y="59" width="41" height="22" rx="1" fill="#424f5b"/><path d="M34 77H68" stroke="#71808b"/><rect x="35" y="63" width="14" height="6" fill="#83b2c3" stroke="none"/><circle cx="65" cy="66" r="1.4" fill="#d8e6e8" stroke="none"/><rect x="31" y="84" width="41" height="22" rx="1" fill="#424f5b"/><path d="M34 102H68" stroke="#71808b"/><rect x="35" y="88" width="14" height="6" fill="#83b2c3" stroke="none"/><circle cx="65" cy="91" r="1.4" fill="#d8e6e8" stroke="none"/><rect x="31" y="109" width="41" height="22" rx="1" fill="#424f5b"/><path d="M34 127H68" stroke="#71808b"/><rect x="35" y="113" width="14" height="6" fill="#83b2c3" stroke="none"/><circle cx="65" cy="116" r="1.4" fill="#d8e6e8" stroke="none"/><path d="M33 28V18H40V28M48 28V16H55V28M62 28V20H68V28" fill="#e8eff0"/><path d="M76 61L87 51H157L165 61" fill="#f8fafb"/><rect x="78" y="61" width="83" height="75" rx="2" fill="#edf1f3"/><path d="M87 67H152V128H87Z" fill="#ffffff"/><rect x="94" y="75" width="21" height="13" rx="1" fill="#e5ebef"/><rect x="98" y="78" width="13" height="6" fill="#8ba3b1" stroke="none"/><circle cx="141" cy="81" r="2" fill="#2d5f8a" stroke="none"/><path d="M163 52H202L219 65V136H163Z" fill="#2d5f8a"/><path d="M202 52L219 65V136H202Z" fill="#162230" opacity=".22" stroke="none"/><path d="M168 61H195V81H168Z" fill="#e9f0f2"/><path d="M172 65H191V74H172Z" fill="#375b6f" stroke="none"/><path d="M171 101H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 105H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 109H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 113H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 117H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 121H195" stroke="#b6cad4" stroke-width="1"/><path d="M171 125H195" stroke="#b6cad4" stroke-width="1"/><path d="M77 93Q73 87 72 78" fill="none" stroke="#303b46"/><path d="M33 138H70M89 138H152M171 138H209" stroke="#303b46" stroke-width="3"/></g>',
    bilayer: '<path d="M35 57c22-18 39 18 62 0s39 18 62 0 33 11 47 0M35 105c22-18 39 18 62 0s39 18 62 0 33 11 47 0"/><g fill="' + SAND + '">' + [48,72,96,120,144,168].map(function (x) { return '<circle cx="' + x + '" cy="55" r="7"/><circle cx="' + (x + 8) + '" cy="107" r="7"/>'; }).join('') + '</g><path d="M52 67v28M76 67v28M100 67v28M124 67v28M148 67v28M172 67v28" stroke="' + BLUE + '" stroke-width="3"/>',
    neutrophil: '<path d="M54 46c-19 13-22 39-9 57-4 24 20 39 42 32 24 8 48-10 47-34 16-19 5-48-18-54-13-19-43-19-62-1Z" fill="' + PALE + '"/><path d="M76 67c-14-9-22 11-10 20 9 7 17-2 13-9-4-7 11-3 10-12-1-4-7-3-13 1ZM104 64c8-11 23 0 19 11-3 8-12 8-14 1-1-5-11 4-15-3-2-4 3-6 10-9Z" fill="' + BLUE + '" stroke="none"/><circle cx="58" cy="98" r="4" fill="' + SAND + '"/><circle cx="126" cy="99" r="4" fill="' + SAND + '"/>',
    macrophage: '<path d="M54 50c-13-16 12-29 29-19 18-15 38 5 31 20 23 2 36 30 20 44 9 24-18 39-37 26-24 13-49-6-40-28-20-12-17-36-3-43Z" fill="' + MINT + '"/><path d="M78 61c-16-7-24 14-11 21 11 6 21-4 15-11-6-7 12-3 10-12-1-4-7-2-14 2Z" fill="' + BLUE + '" stroke="none"/><circle cx="116" cy="92" r="13" fill="' + SAND + '" stroke="none"/><circle cx="91" cy="112" r="6" fill="' + SAND + '" stroke="none"/>',
    arrow: '<path d="M43 80H174" stroke="#2d5f8a" stroke-width="2"/><path d="M174 75L185 80L174 85Z" fill="#2d5f8a" stroke="none"/>',
    overview: '<rect x="28" y="57" width="35" height="47" rx="5"/><path d="M68 81h32M137 81h35"/><circle cx="118" cy="81" r="18" fill="' + PALE + '"/><path d="M106 81h24M118 69v24"/><path d="M38 117h152" stroke="' + SAND + '" stroke-width="10" stroke-linecap="round"/>',
    person: '<g transform="translate(25 0)" fill="#2d5f8a" stroke="none"><circle cx="100" cy="28" r="9"/><path d="M91 42Q100 38 109 42L116 75Q116 80 112 80Q109 80 108 76L105 59V92L106 138Q106 143 101 143Q97 143 97 138L95 98L93 138Q93 143 88 143Q84 143 84 138L85 91V59L82 76Q81 80 77 79Q74 78 75 74L82 45Q84 41 91 42Z"/></g>',
    cohortLabel: '<rect x="28" y="49" width="184" height="62" rx="3" fill="#ffffff" stroke="#2d5f8a" stroke-width="1"/>',
    connector: '<path d="M31 80H163" stroke="#2d5f8a" stroke-width="2"/><path d="M163 74L178 80L163 86Z" fill="#2d5f8a" stroke="none"/>',
    classChip: '<rect x="28" y="48" width="184" height="64" rx="3" fill="#2d5f8a" stroke="none"/>',
    vialComponent: '<g stroke="#889198" stroke-width="1.2"><path d="M104 30H136V134Q136 145 120 145Q104 145 104 134Z" fill="#f1f5f6"/><path d="M108 56H132V108H108Z" fill="#f5d780" stroke="none"/><path d="M108 108H132V133Q132 141 120 141Q108 141 108 133Z" fill="#a32f38" stroke="none"/><path d="M108 108H132" stroke="#842730"/><path d="M107 37V129" stroke="#ffffff" stroke-width="3"/><path d="M135 38V132" stroke="#cad2d5"/><rect x="100" y="15" width="40" height="22" rx="3" fill="#2d5f8a" stroke="#a96b2c"/><path d="M105 18V33" stroke="#f6b95c"/><path d="M110 18V33" stroke="#f6b95c"/><path d="M115 18V33" stroke="#f6b95c"/><path d="M120 18V33" stroke="#f6b95c"/><path d="M125 18V33" stroke="#f6b95c"/><path d="M130 18V33" stroke="#f6b95c"/><path d="M135 18V33" stroke="#f6b95c"/><path d="M101 36H139" stroke="#b9742c"/></g>',
  };

  function validColor(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
  function find(id) { return assets.filter(function (a) { return a.id === id; })[0] || null; }
  function svg(id, color, labelText) {
    var asset = find(id);
    if (!asset) throw new Error('Unknown Team illustration: ' + id);
    color = color === undefined ? asset.defaultColor : color;
    if (!validColor(color)) throw new Error('Illustration color must be a six-digit hex value.');
    var hasCustomLabel = (asset.kind === 'cohortLabel' || asset.kind === 'classChip') && typeof labelText === 'string' && labelText.trim();
    var body = shapes[asset.kind].replace(/#2d5f8a/gi, color);
    // The unlabelled templates use a guide line as a visual placeholder. Once
    // the user supplies a label, remove that guide so it never crosses text.
    if (hasCustomLabel && asset.kind === 'cohortLabel') body = body.replace(/<path d="M48 80h144"[^>]*\/>/, '');
    if (hasCustomLabel && asset.kind === 'classChip') body = body.replace(/<path d="M86 80h98"[^>]*\/>/, '');
    var label = asset.title.replace(/&/g, '&amp;');
    var labelX = 120;
    var labelSize = Math.max(8, Math.min(19, 265 / (hasCustomLabel ? labelText.trim().length : 1)));
    var labelFill = INK;
    if (asset.kind === 'classChip') { var rgb = [1,3,5].map(function(i){return parseInt(color.slice(i,i+2),16)/255;}).map(function(v){return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}); labelFill = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2] > .179 ? '#162230' : '#ffffff'; }
    var custom = hasCustomLabel ? '<text x="' + labelX + '" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-size="' + labelSize + '" font-weight="500" fill="' + labelFill + '">' + labelText.trim().replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]; }) + '</text>' : '';
    var compact = asset.kind === 'cohortLabel' || asset.kind === 'classChip' || asset.kind === 'connector';
    var viewBox = asset.kind === 'connector' ? '24 46 164 68' : (compact ? '24 44 192 72' : '0 0 240 160');
    var baseline = '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '" role="img" aria-label="' + label + '" data-team-illustration-version="1" data-team-illustration-style="2" data-team-illustration-kind="schematic-not-to-scale"><title>' + label + '</title><desc>Original schematic illustration for lipidomics workflow context; not to scale and not a measured anatomical reconstruction.</desc><g fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" color="' + color + '">' + body + baseline + '</g>' + custom + '</svg>';
  }
  var list = assets.map(function (a) { return { id: a.id, title: a.title, category: a.category, defaultColor: a.defaultColor }; });
  var api = { version: '1', list: list, svg: svg, get: find };
  // canvas_assets.js is loaded before this file in Team; merge its original
  // editable taxonomy into the same allowlisted resolver for restore safety.
  if (window.TeamCanvasAssets && Array.isArray(window.TeamCanvasAssets.list)) {
    window.TeamCanvasAssets.list.forEach(function (asset) { if (!list.some(function (x) { return x.id === asset.id; })) list.push(asset); });
    var base = api.svg, assetSvg = window.TeamCanvasAssets.svg;
    api.get = function (id) { return list.find(function (a) { return a.id === id; }) || null; };
    api.svg = function (id, color, labelText) { return window.TeamCanvasAssets.list.some(function (x) { return x.id === id; }) ? assetSvg(id, color, labelText) : base(id, color, labelText); };
  }
  window.TeamIllustrations = api;
}());

export interface Asset {id:string;title:string;category:string;defaultColor?:string}
export const list: Asset[] = window.TeamIllustrations.list;
export const hiddenIds = new Set(['cohort-donor','workflow-overview','workflow-arrow','lipid-class-taxonomy','study-workflow-scd']);
export const svg: (id:string,color?:string,label?:string)=>string = window.TeamIllustrations.svg;
export function dataUrl(id:string,color?:string,label?:string):string {return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(id,color,label));}
