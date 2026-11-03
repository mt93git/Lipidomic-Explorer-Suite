// Exercise the shared PDF wrapper without a browser; the SVG renderer is a
// small stand-in so the test can inspect real jsPDF text and source isolation.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
const {jsPDF}=require('../../www/team/vendor/jspdf.umd.min.js');
jsPDF.API.svg=async function(element){element.nodes.forEach((n,i)=>this.text(n.nodeValue,20,30+i*20));this.setFillColor(0,71,171);this.rect(20,100,80,20,'F');};
const source={nodes:[{nodeValue:'Axis −1'},{nodeValue:'Colorbar −0.5'}],cloneNode(){return {nodes:this.nodes.map(n=>({nodeValue:n.nodeValue}))};}};
const document={readyState:'loading',addEventListener(){},createTreeWalker(element){let i=0;return {nextNode(){return element.nodes[i++]||null;}};}};
const window={};
vm.runInNewContext(fs.readFileSync(path.resolve('www/team/js/plot_exports.js'),'utf8'),{window,document,NodeFilter:{SHOW_TEXT:4}});
// Libraries can load after plot_exports.js; the snapshot entry point retries.
window.jspdf={jsPDF};window.TeamPdf.ensureMinusFix();window.TeamPdf.ensureMinusFix();
(async()=>{const pdf=new jsPDF({unit:'pt',format:[200,150]});await pdf.svg(source,{});assert.equal(source.nodes[0].nodeValue,'Axis −1');assert.equal(source.nodes[1].nodeValue,'Colorbar −0.5');const out=process.env.PAULA_EXPORT_EVIDENCE;fs.mkdirSync(out,{recursive:true});const file=path.join(out,'minus-node.pdf');fs.writeFileSync(file,Buffer.from(pdf.output('arraybuffer')));const text=cp.execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});assert(text.includes('Axis -1'));assert(text.includes('Colorbar -0.5'));fs.writeFileSync(path.join(out,'minus-node.txt'),text);console.log('PASS jsPDF wrapper converts axis and colorbar minus on a clone; real PDF text extracted; vector rectangle emitted. Renderer is a stand-in, not svg2pdf or an actual heatmap.');})().catch(e=>{console.error(e);process.exitCode=1});
