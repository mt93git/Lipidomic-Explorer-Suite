import { useId } from 'react';
/** Team's neutrophil artwork (www/team/js/companion_art.js, the prototype's art()), unchanged, as React SVG. */
const body = 'M33 41C48 23 70 20 88 25C111 23 133 45 133 67C144 86 130 113 111 122C93 139 64 136 47 124C24 117 18 93 24 74C18 61 22 48 33 41Z';
const dots = [[38, 79], [49, 102], [70, 119], [99, 108], [116, 87], [110, 38], [35, 60], [86, 74], [119, 68]];
export function Art() {
  const id = `cell-art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <svg viewBox="0 0 160 160" aria-hidden="true" focusable="false">
    <defs><radialGradient id={id} cx="32%" cy="24%" r="83%"><stop stopColor="#FFFFFF"/><stop offset=".5" stopColor="#E9F2F7"/><stop offset="1" stopColor="#B9D7ED"/></radialGradient>
      <linearGradient id={`${id}-n`} x2="1" y2="1"><stop stopColor="#7393BD"/><stop offset="1" stopColor="#2D5F8A"/></linearGradient></defs>
    <ellipse cx="80" cy="148" rx="35" ry="5" fill="#162230" opacity=".12"/><ellipse cx="80" cy="79" rx="66" ry="65" fill="none" stroke="#78AFE0" strokeWidth="1.5" opacity=".15"/>
    <g className="cell-body"><path d={body} fill={`url(#${id})`} stroke="#294C66" strokeWidth="2.2"/><path d={body} transform="translate(8 8) scale(.9)" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity=".85"/>
      <path d="M39 42Q52 26 69 30" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".85"/>
      <g fill={`url(#${id}-n)`}><path d="M48 50Q62 37 72 46Q80 40 89 50Q99 49 108 61" fill="none" stroke="#54759F" strokeWidth="6"/><ellipse cx="46" cy="55" rx="14" ry="12" transform="rotate(-30 46 55)"/><ellipse cx="73" cy="44" rx="13" ry="12"/><ellipse cx="101" cy="58" rx="14" ry="12" transform="rotate(30 101 58)"/></g>
      <g>{dots.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 2.4 : 1.7} fill={i % 2 ? '#87ABC0' : '#2D5F8A'} opacity=".48"/>)}</g>
      <g><g className="cell-eyes" fill="#162230"><ellipse cx="65" cy="86" rx="4.5" ry="6"/><ellipse cx="90" cy="86" rx="4.5" ry="6"/><g fill="white"><circle cx="66" cy="84" r="1.5"/><circle cx="91" cy="84" r="1.5"/></g></g>
        <g fill="#E4A29D" opacity=".5"><ellipse cx="54" cy="94" rx="5" ry="3"/><ellipse cx="101" cy="94" rx="5" ry="3"/></g><path d="M72 97Q78 103 84 97" fill="none" stroke="#294C66" strokeWidth="2.3" strokeLinecap="round"/></g>
      <circle cx="125" cy="34" r="3" fill="#78AFE0"/><path d="M133 16v8m-4-4h8" stroke="#78AFE0" strokeWidth="1.5" strokeLinecap="round"/></g>
  </svg>;
}
