# Generates public/auth/login-samples.svg: Admin's sign-in illustration, in the style of Nexo's login-spectrum.svg
# (same palette, soft circles, lipid figures), with a sample rack and a well plate for the lab's order desk.
import math, random
random.seed(7)
P = [("#BCD8EC", "#5C8DB8", "#7a8c99"), ("#FFCBE1", "#E86F5C", "#b2997e"), ("#DCCCEC", "#8E6BB8", "#8497a5"),
     ("#D6E5BD", "#5E9A4E", "#8b957b"), ("#FFDAB4", "#E08A3C", "#a68e75"), ("#F9E1A8", "#D9A531", "#a2926d")]
INK = "#162230"
o = []
def lipid(x, y, pal, s=1.5, rot=0):
    soft, strong, ring = pal
    return (f'<g transform="translate({x:.0f} {y:.0f}) rotate({rot}) scale({s})">'
            f'<path d="M-3 7 q-4 8 0 16 t0 16" stroke="{strong}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
            f'<path d="M4 7 q4 8 0 16 t0 13" stroke="{strong}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
            f'<circle r="8" fill="{soft}" stroke="{ring}" stroke-width="1.6"/></g>')
o.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">')
o.append('<style>.tb{animation:up 1.1s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d)}'
         '.lq{transform-box:fill-box;transform-origin:50% 100%;animation:fill 1.2s ease-out both;animation-delay:calc(var(--d) + .5s)}'
         '.lp{animation:appear .9s ease-out both,bob var(--t) ease-in-out 3;animation-delay:calc(var(--d) + 1.2s),calc(var(--d) + 2.1s)}'
         '.fl{animation:bob var(--t) ease-in-out 3;animation-delay:var(--p)}.wl{animation:appear .6s ease-out both;animation-delay:var(--d)}'
         '@keyframes up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}'
         '@keyframes fill{from{transform:scaleY(0)}to{transform:scaleY(1)}}'
         '@keyframes appear{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}'
         '@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
         '@media (prefers-reduced-motion:reduce){.tb,.lq,.lp,.fl,.wl{animation:none!important}}</style>')
o.append('<defs><linearGradient id="a-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EDF4FB"/><stop offset=".55" stop-color="#F8F4FB"/><stop offset="1" stop-color="#FFF4E8"/></linearGradient>'
         '<linearGradient id="a-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#DCCCEC" stop-opacity=".55"/></linearGradient>'
         '<linearGradient id="a-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".9"/><stop offset=".35" stop-color="#FFFFFF" stop-opacity=".35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".7"/></linearGradient></defs>')
o.append('<rect width="1600" height="1000" fill="url(#a-bg)"/><rect y="780" width="1600" height="220" fill="url(#a-floor)"/>')
for cx, cy, r, c in [(200, 190, 130, "#BCD8EC"), (1430, 150, 120, "#FFCBE1"), (1480, 600, 90, "#D6E5BD"), (110, 590, 80, "#F9E1A8"), (800, 40, 70, "#DCCCEC")]:
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}" opacity=".55"/>')
o.append(f'<line x1="40" y1="930" x2="1560" y2="930" stroke="{INK}" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>')

# Two racks of sample tubes, left and right of the card.
def rack(x0, heights, offset):
    W, gap, base = 34, 64, 926
    n = len(heights)
    for i, h in enumerate(heights):
        soft, strong, ring = P[(i + offset) % len(P)]
        x = x0 + i * gap; top = base - h; d = f"{(i + offset) * 0.09:.2f}s"
        lvl = top + 26 + h * random.uniform(.18, .42)
        o.append(f'<g class="tb" style="--d:{d}">')
        o.append(f'<path class="lq" style="--d:{d}" d="M{x+3} {lvl:.0f} H{x+W-3} V{base-W/2} a{W/2-3} {W/2-3} 0 0 1 -{W-6} 0Z" fill="{soft}" stroke="{strong}" stroke-width="1.6"/>')
        o.append(f'<path d="M{x} {top+14} V{base-W/2} a{W/2} {W/2} 0 0 0 {W} 0 V{top+14}" fill="url(#a-glass)" stroke="{INK}" stroke-width="2" opacity=".75"/>')
        o.append(f'<rect x="{x-4}" y="{top}" width="{W+8}" height="16" rx="4" fill="{strong}"/>')
        o.append(f'<line x1="{x+8}" y1="{top+40}" x2="{x+8}" y2="{base-30}" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".7"/>')
        o.append('</g>')
        if i % 2 == 0:
            ly = top - 70 - random.randint(0, 40)
            o.append(f'<g class="lp" style="--d:{d};--t:{7 + i % 3}s"><line x1="{x+W/2}" y1="{ly+28}" x2="{x+W/2}" y2="{top-8}" stroke="{strong}" stroke-width="1.6" stroke-dasharray="2 5" opacity=".6"/>{lipid(x+W/2, ly, P[(i + offset) % len(P)])}</g>')
    # rack rail in front of the tubes
    x1 = x0 - 24; x2 = x0 + (n - 1) * gap + W + 24
    o.append(f'<rect x="{x1}" y="852" width="{x2-x1}" height="26" rx="6" fill="#FFFFFF" stroke="{INK}" stroke-width="2" opacity=".9"/>')
    for i in range(n):
        o.append(f'<circle cx="{x0 + i*gap + W/2}" cy="865" r="4" fill="{INK}" opacity=".25"/>')
    o.append(f'<line x1="{x1+14}" y1="878" x2="{x1+14}" y2="930" stroke="{INK}" stroke-width="2" opacity=".6"/><line x1="{x2-14}" y1="878" x2="{x2-14}" y2="930" stroke="{INK}" stroke-width="2" opacity=".6"/>')
rack(120, [250, 300, 220, 330, 270], 0)
rack(1170, [280, 230, 320, 250, 290], 3)

# A 96-well plate on the bench under the card: some wells filled, in the palette.
px, py, pw, ph = 600, 836, 400, 90
o.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="10" fill="#FFFFFF" stroke="{INK}" stroke-width="2" opacity=".9"/>')
o.append(f'<rect x="{px}" y="{py+ph-14}" width="{pw}" height="14" rx="6" fill="#DCCCEC" opacity=".6"/>')
for r in range(3):
    for c in range(12):
        cx = px + 30 + c * 31.5; cy = py + 20 + r * 20
        if random.random() < .62:
            soft, strong, _ = P[(c // 2 + r) % len(P)]
            o.append(f'<circle class="wl" style="--d:{1.0 + (r*12+c)*0.025:.2f}s" cx="{cx:.1f}" cy="{cy}" r="7" fill="{soft}" stroke="{strong}" stroke-width="1.4"/>')
        else:
            o.append(f'<circle cx="{cx:.1f}" cy="{cy}" r="7" fill="none" stroke="#A9BED1" stroke-width="1.4"/>')

# Floating lipids around the edges.
for i, (x, y) in enumerate([(90, 420), (330, 360), (470, 210), (560, 520), (1060, 560), (1120, 230), (1300, 380), (1520, 330), (260, 110), (1290, 90), (980, 120)]):
    o.append(f'<g class="fl" style="--p:-{i*1.3:.1f}s;--t:{8 + i % 3}s">{lipid(x, y, P[i % len(P)], s=round(random.uniform(.85, 1.1), 2), rot=random.choice([-30, -18, 15, 25, 35]))}</g>')
o.append('</svg>')
open("public/auth/login-samples.svg", "w").write("".join(o))
