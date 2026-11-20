#!/usr/bin/env python3
"""Erzeugt Lernseiten im einheitlichen Stil aus den Vorlagen in quellen/.
Aufruf:  python3 tools/seiten.py   (danach: node tools/build.mjs)"""
import html, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FARBEN = {  # hell: primary, primary-light, bg, soft, soft2, border | dunkel: dieselben
    'aee':  (('#1d4ed8', '#2563eb', '#eff6ff', '#eff6ff', '#dbeafe', '#dbeafe', '#1e40af', '#2563eb'),
             ('#60a5fa', '#93c5fd', '#050d1a', '#091524', '#060f1e', '#1a2d4a', '#030a1a', '#1e40af')),
    'am':   (('#5b21b6', '#6d28d9', '#f3f0ff', '#f5f3ff', '#ede9fe', '#e4defc', '#1e1b6b', '#6d28d9'),
             ('#a78bfa', '#c4b5fd', '#0b0818', '#130f26', '#0d0a1c', '#2a2250', '#07051a', '#4c1d95')),
    'met':  (('#b45309', '#d97706', '#fffbeb', '#fffbeb', '#fef3c7', '#fde9b8', '#92400e', '#d97706'),
             ('#fbbf24', '#fcd34d', '#140d02', '#1c1304', '#150e03', '#3d2a0a', '#1c1002', '#92400e')),
}

CSS = r"""
:root { --primary:%(p)s; --primary-light:%(pl)s; --bg:%(bg)s; --soft:%(soft)s; --soft2:%(soft2)s; --border:%(bd)s; --h1:%(h1)s; --h2:%(h2)s;
  --card:#ffffff; --text:#0f172a; --muted:#64748b; --ok:#047857; --ok-bg:#ecfdf5;
  --warn-bg:#fffbeb; --warn-bd:#d97706; --warn-tx:#92400e; --dot:rgba(148,163,184,0.22);
  --shadow-sm:0 2px 8px rgba(15,23,42,0.07),0 1px 3px rgba(15,23,42,0.04); --radius:16px; --radius-sm:10px; }
body.dark { --primary:%(dp)s; --primary-light:%(dpl)s; --bg:%(dbg)s; --soft:%(dsoft)s; --soft2:%(dsoft2)s; --border:%(dbd)s; --h1:%(dh1)s; --h2:%(dh2)s;
  --card:#0f1626; --text:#e2e8f0; --muted:#94a3b8; --ok:#34d399; --ok-bg:#052e22;
  --warn-bg:#1a0f00; --warn-bd:#d97706; --warn-tx:#fbbf24; --dot:rgba(51,65,85,0.6);
  --shadow-sm:0 2px 8px rgba(0,0,0,0.35); color-scheme:dark; }
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:var(--bg);
  background-image:radial-gradient(circle,var(--dot) 0.85px,transparent 0.85px);background-size:22px 22px;
  color:var(--text);min-height:100vh;font-size:15px;line-height:1.57}
#top-progress-bar{position:fixed;top:0;left:0;height:3px;width:0%%;background:var(--primary-light);z-index:9999;pointer-events:none}
header{background:linear-gradient(135deg,var(--h1) 0%%,var(--h2) 100%%);color:#fff;padding:1.25rem 2.5rem 1.1rem;position:relative;overflow:hidden}
.h-deco{position:absolute;right:2.5rem;top:50%%;transform:translateY(-50%%);font-size:3.5rem;opacity:.08;font-style:italic;user-select:none;white-space:nowrap}
.h-content{position:relative}
.h-badge{display:inline-flex;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.18);padding:.3rem .95rem;border-radius:999px;font-size:.75rem;font-weight:600;margin-bottom:.85rem}
header h1{font-size:2.3rem;font-weight:800;letter-spacing:-.75px;line-height:1.15;margin-bottom:.35rem}
.h-motto{font-size:.92rem;font-style:italic;color:rgba(255,255,255,.78);max-width:46rem}
nav{background:var(--card);border-bottom:1px solid var(--border);padding:.55rem 1.75rem;display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;position:sticky;top:0;z-index:50;box-shadow:0 1px 14px rgba(15,23,42,.07)}
.nav-label{font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.nav-jump{display:flex;flex-wrap:wrap;gap:.3rem}
.nav-jump a{font:600 .75rem 'JetBrains Mono',monospace;color:var(--primary);text-decoration:none;padding:.2rem .5rem;border-radius:7px;border:1px solid var(--border);background:var(--soft)}
.nav-jump a:hover{background:var(--soft2)}
.btn{display:inline-flex;align-items:center;padding:.33rem .7rem;border-radius:9px;font:500 .78rem Inter,sans-serif;cursor:pointer;background:var(--soft);color:var(--text);border:1px solid var(--border)}
.btn:hover{background:var(--soft2)}
.btn-dm{margin-left:auto;font-size:1.05rem;line-height:1}
.nav-right{margin-left:auto;display:flex;gap:.5rem}.nav-right .btn-dm{margin-left:0}
main{max-width:900px;margin:0 auto;padding:1.75rem 1.25rem 4rem}
.sum-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:1.5rem;box-shadow:var(--shadow-sm);scroll-margin-top:70px;overflow:hidden}
.sum-header{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;padding:.9rem 1.5rem;background:linear-gradient(135deg,var(--soft),var(--soft2));border-bottom:1px solid var(--border)}
.sum-num{font:600 .72rem 'JetBrains Mono',monospace;background:var(--primary);color:var(--card);padding:.2rem .6rem;border-radius:999px;white-space:nowrap}
.sum-title{font-weight:700;font-size:1.05rem;flex:1;min-width:10rem}
.sum-note{font-size:.72rem;font-weight:600;color:var(--primary);border:1px solid var(--border);background:var(--card);padding:.2rem .65rem;border-radius:999px;white-space:nowrap}
.sum-body{padding:1.25rem 1.5rem 1.4rem}
.md-out p{margin-bottom:.7rem}.md-out p:last-child{margin-bottom:0}
.md-out ul{margin:.3rem 0 .8rem 1.3rem}.md-out li{margin-bottom:.3rem}
.md-out strong{color:var(--primary)}
.md-out h3{font-size:.95rem;font-weight:700;color:var(--primary);margin:1.2rem 0 .5rem;padding-bottom:.3rem;border-bottom:1px solid var(--border);scroll-margin-top:70px}
.md-out h3:first-child{margin-top:0}
.tbl-wrap{overflow-x:auto;margin:.5rem 0 1rem}
table{border-collapse:collapse;width:100%%;font-size:.9rem}
th{text-align:left;background:var(--soft);color:var(--primary);padding:.5rem .8rem;border-bottom:2px solid var(--border);white-space:nowrap}
td{padding:.5rem .8rem;border-top:1px solid var(--border);vertical-align:top}
td.math{font-size:1rem}
.formula-box,.formula-mini{background:var(--soft);border-left:4px solid var(--primary-light);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:.6rem 1rem;margin:.5rem 0 .8rem;overflow-x:auto}
.formula-box{font:500 .88rem/1.9 'JetBrains Mono',monospace}
.notice-box,.info-box{background:var(--warn-bg);border-left:4px solid var(--warn-bd);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:.7rem 1rem;margin:.6rem 0 1rem;font-size:.9rem}
.notice-box strong,.info-box strong{color:var(--warn-tx)}
/* Formelkarten */
.formula-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.7rem;margin:.5rem 0 1rem}
.fcard{background:var(--soft);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.7rem .9rem;min-width:0;overflow-x:auto}
.flabel{font-size:.74rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:.3rem}
.feq{font-size:1.02rem;text-align:center;padding:.2rem 0}
.fnote{font-size:.76rem;color:var(--muted);margin-top:.3rem;font-style:italic}
/* Merksatz-Karten */
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-sm);overflow:hidden;min-width:0;scroll-margin-top:70px}
.card-head{padding:.7rem 1.1rem;font-weight:700;font-size:.95rem;display:flex;align-items:center;gap:.5rem;background:linear-gradient(135deg,var(--soft),var(--soft2));border-bottom:1px solid var(--border)}
.card-head>span{display:flex;align-items:center;gap:.5rem;flex:1}
.card-body{padding:.9rem 1.1rem}
.quote{font-size:1rem;font-weight:700;font-style:italic;color:var(--primary);margin-bottom:.35rem;line-height:1.4}
.explain{font-size:.86rem;color:var(--muted);margin-bottom:.6rem}.explain:last-child{margin-bottom:0}
.explain strong{color:var(--text)}
.divider{height:1px;background:var(--border);margin:.7rem 0}
.big-letters{font:700 1.3rem 'JetBrains Mono',monospace;letter-spacing:.06em;color:var(--primary);margin:.1rem 0 .5rem}
.tag{margin-left:auto;font-size:.68rem;font-weight:700;padding:.12rem .55rem;border-radius:999px;background:var(--warn-bg);color:var(--warn-tx);border:1px solid var(--warn-bd)}
/* Aufgaben mit aufklappbarer Lösung */
.meta-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem}
.meta-row div{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.5rem .9rem;font-size:.85rem;box-shadow:var(--shadow-sm)}
.meta-row b{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
details.loesung{margin-top:.9rem;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
details.loesung summary{cursor:pointer;padding:.55rem .9rem;font-weight:600;font-size:.86rem;color:var(--primary);background:var(--soft);list-style-position:inside}
details.loesung[open] summary{border-bottom:1px solid var(--border)}
details.loesung .tbl-wrap{margin:0}
details.loesung td:first-child{font-weight:600;color:var(--muted);white-space:nowrap;width:1%%}
details.loesung tr.erg td{background:var(--ok-bg)}details.loesung tr.erg td:last-child{font-weight:700;color:var(--ok)}
details.loesung tr:first-child td{border-top:0}
:focus-visible{outline:3px solid var(--warn-bd);outline-offset:2px}
@media(max-width:600px){header{padding:1.1rem 1.1rem 1rem}header h1{font-size:1.65rem}.h-deco{display:none}nav{padding:.5rem 1rem}.sum-body,.sum-header{padding-left:1rem;padding-right:1rem}}
@media print{nav,#top-progress-bar{display:none}.sum-wrap,.card{break-inside:avoid;box-shadow:none}details.loesung>*{display:block}}
"""

JS = r"""
window.addEventListener('scroll',function(){var sh=document.documentElement.scrollHeight-window.innerHeight;
  document.getElementById('top-progress-bar').style.width=(sh>0?window.scrollY/sh*100:0)+'%';});
(function(){var btn=document.getElementById('dm-toggle');
  function apply(d){document.body.classList.toggle('dark',d);btn.textContent=d?'☀️':'🌙';try{localStorage.setItem('lern-seite-theme',d?'dark':'light')}catch(e){}}
  var s=null;try{s=localStorage.getItem('lern-seite-theme')}catch(e){}
  apply(s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches));
  btn.addEventListener('click',function(){apply(!document.body.classList.contains('dark'))});
  var all=document.getElementById('sol-toggle');
  if(all)all.addEventListener('click',function(){var ds=[].slice.call(document.querySelectorAll('details.loesung'));
    var open=ds.some(function(d){return !d.open});ds.forEach(function(d){d.open=open});all.textContent=open?'Alle Lösungen schließen':'Alle Lösungen zeigen';});
})();
"""

def seite(pfad, farbe, titel, badge, motto, deco, body, jump=(), jump_label='Abschnitt', mathjax=False, extra_nav='', extra_css=''):
    h, d = FARBEN[farbe]
    keys = ('p', 'pl', 'bg', 'soft', 'soft2', 'bd', 'h1', 'h2')
    css = CSS % {**dict(zip(keys, h)), **dict(zip(['d' + k for k in keys], d))}
    links = ''.join('<a href="#%s">%s</a>' % (a, html.escape(t)) for a, t in jump)
    out = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(titel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
{'<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.min.js"></script>' if mathjax else ''}
<style>{css}{extra_css}</style>
</head>
<body>
<div id="top-progress-bar"></div>
<header>
    <div class="h-deco">{deco}</div>
    <div class="h-content">
        <div class="h-badge">{badge}</div>
        <h1>{html.escape(titel)}</h1>
        <p class="h-motto">{motto}</p>
    </div>
</header>
<nav>
    {'<span class="nav-label">%s</span><div class="nav-jump">%s</div>' % (jump_label, links) if links else ''}
    <div class="nav-right">{extra_nav}<button class="btn btn-dm" id="dm-toggle" title="Dunkles Design">🌙</button></div>
</nav>
<main>
{body}
</main>
<script>{JS}</script>
<script src="../../shared/hub.js"></script>
</body>
</html>
"""
    (ROOT / pfad).write_text(out, encoding='utf-8')
    print('geschrieben:', pfad)

def wrap(nr, titel, inhalt, note='', anker=None):
    return ('<div class="sum-wrap" id="%s"><div class="sum-header">%s<span class="sum-title">%s</span>%s</div>'
            '<div class="sum-body md-out">%s</div></div>\n') % (
        anker or 's%s' % nr, '<span class="sum-num">%s</span>' % nr if nr else '', titel,
        '<span class="sum-note">%s</span>' % note if note else '', inhalt)

# ───────────────────────── Markdown (kleiner Umfang: Überschriften, Listen, Tabellen) ─────────────────────────
def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    return re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)

def md_block(lines):
    out, i = [], 0
    while i < len(lines):
        l = lines[i]
        if not l.strip() or l.strip() == '---': i += 1; continue
        if l.startswith('### '): out.append('<h3>%s</h3>' % inline(l[4:].strip())); i += 1; continue
        if l.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            head, rest = rows[0], [r for r in rows[2:]]
            out.append('<div class="tbl-wrap"><table><tr>%s</tr>%s</table></div>' % (
                ''.join('<th>%s</th>' % inline(c) for c in head),
                ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in rest)))
            continue
        if l.startswith('- '):
            items = []
            while i < len(lines) and lines[i].startswith('- '): items.append(lines[i][2:]); i += 1
            out.append('<ul>%s</ul>' % ''.join('<li>%s</li>' % inline(x) for x in items)); continue
        para = []
        while i < len(lines) and lines[i].strip() and not re.match(r'(\||- |### |---)', lines[i]): para.append(lines[i].strip()); i += 1
        out.append('<p>%s</p>' % '<br>'.join(inline(x) for x in para))
    return '\n'.join(out)

def met():
    src = (ROOT / 'quellen/MET_Lernuebersicht.md').read_text(encoding='utf-8').split('\n')
    secs, cur = [], None
    for l in src:
        if l.startswith('## '): cur = [l[3:].strip(), []]; secs.append(cur)
        elif l.startswith('### Schnell-Merker'): cur = ['Schnell-Merker fürs Prüfungsgedächtnis', []]; secs.append(cur)
        elif cur: cur[1].append(l)
    body, jump = '', []
    for t, lines in secs:
        m = re.match(r'(\d+)\.\s*(.*?)\s*(?:\((UE [^)]*)\))?$', t)
        if m:
            nr, name, ue = m.group(1), m.group(2), m.group(3) or ''
            body += wrap(nr, inline(name), md_block(lines), ue); jump.append(('s' + nr, nr))
        else:
            body += wrap('', inline(t), md_block(lines), 'Kurz und knapp', 'merker'); jump.append(('merker', 'Merker'))
    seite('faecher/met/lernuebersicht.html', 'met', 'MET — Lernübersicht', '🔌 Unterrichtseinheiten 7–21',
          'Leitungen · Sicherungen · Schutzschalter · Fehlerarten · Schutzmaßnahmen · IP-Schutzarten · Schutzklassen',
          'PE · IP · LS', body, jump)

# ───────────────────────── AEE2: vorhandenes HTML übernehmen, nur neu einkleiden ─────────────────────────
def aee():
    f = (ROOT / 'quellen/formeluebersicht_aee2.html').read_text(encoding='utf-8')
    inner = f[f.index('<div class="content">') + len('<div class="content">'):f.rindex('</div>\n</body>')]
    inner = re.sub(r'<div class="section" id="(s\d+)">\s*<div class="section-header [^"]*"><span class="section-num [^"]*">(\d+)</span><h2>(.*?)</h2></div>\s*<div class="section-body">',
                   r'<div class="sum-wrap" id="\1"><div class="sum-header"><span class="sum-num">\2</span><span class="sum-title">\3</span></div><div class="sum-body md-out">', inner)
    inner = re.sub(r'class="info-box \w+"', 'class="info-box"', inner)
    inner = inner.replace('<table>', '<div class="tbl-wrap"><table>').replace('</table>', '</table></div>')
    jump = [(a, n) for a, n in re.findall(r'id="(s(\d+))"', inner)]
    seite('faecher/aee/formeluebersicht.html', 'aee', 'AEE2 — Formelübersicht', '⚡ Wechselstromtechnik',
          'Alle Formeln aus den Unterlagen: Kenngrößen, R, L, C, Impedanz, Leistung, Trigonometrie, Gleichstrom',
          'Z = √(R² + X²)', inner, jump, mathjax=True)

    m = (ROOT / 'quellen/merksaetze_aee2.html').read_text(encoding='utf-8')
    inner = m[m.index('<div class="grid">'):m.rindex('</body>')]
    inner = re.sub(r'class="card-head ch-\w+"', 'class="card-head"', inner)
    inner = re.sub(r'class="(quote|big-letters) (?:q|bl)-\w+"', r'class="\1"', inner)
    inner = inner.replace('class="tag t-test"', 'class="tag"')
    seite('faecher/aee/merksaetze.html', 'aee', 'AEE2 — Merksätze & Eselsbrücken', '⚡ Wechselstromtechnik',
          'Kompaktkarten zum Auswendiglernen', 'ELI · ICE', inner, mathjax=True)

# ───────────────────────── Mathematik: Probeschularbeit (aus der Word-Datei übertragen) ─────────────────────────
AUFGABEN = [
 ('Bogenmaß umrechnen', 6, ['a) Wandle 150° in Radiant um.', 'b) Wandle 5π/6 rad in Grad um.'],
  [('Formel', 'α[rad] = α[°] · π / 180'), ('a)', '150° · π / 180 = 5π/6 rad ≈ 2,62 rad'), ('b)', '(5π/6) · 180 / π = 150°'), ('Merke', '180° = π rad')]),
 ('Winkeldreieck', 8, ['In einem rechtwinkligen Dreieck gilt: Gegenkathete GK = 7 cm, Ankathete AK = 24 cm.', 'a) Berechne die Hypotenuse h.', 'b) Berechne den Winkel α mit tan α = GK / AK.'],
  [('Formel', 'h² = GK² + AK² und tan α = GK / AK'), ('a)', 'h = √(7² + 24²) = √625 = 25,0 cm'), ('b)', 'tan α = 7 / 24 = 0,2917 → α = arctan(0,2917) ≈ 16,3°'), ('Merke', 'Im rechtwinkligen Dreieck rechnet man für die Hypotenuse mit dem Satz des Pythagoras.')]),
 ('Wechselstrom-Grundgrößen', 8, ['Eine Sinusspannung hat die Frequenz f = 50 Hz.', 'a) Berechne die Periodendauer T.', 'b) Berechne die Winkelgeschwindigkeit ω.'],
  [('Formeln', 'T = 1 / f und ω = 2π · f'), ('a)', 'T = 1 / 50 s = 0,02 s = 20 ms'), ('b)', 'ω = 2π · 50 = 100π s⁻¹ ≈ 314 s⁻¹'), ('Merke', 'Die Frequenz ist die Anzahl der Perioden pro Sekunde.')]),
 ('Scheitelwert und Effektivwert', 6, ['Eine Netzspannung hat den Effektivwert Ueff = 230 V.', 'Berechne den Scheitelwert û.'],
  [('Formel', 'û = Ueff · √2'), ('Rechnung', 'û = 230 · √2 ≈ 325,3 V'), ('Ergebnis', 'û ≈ 325 V'), ('Merke', 'Für Sinus gilt Ueff = û / √2.')]),
 ('Augenblickswert', 8, ['Gegeben sind û = 325 V, f = 50 Hz und t = 10 ms.', 'Berechne den Augenblickswert u(t) mit der Formel u(t) = û · sin(ωt).', 'Hinweis: Rechne im RAD-Modus oder mit dem DEG-Trick.'],
  [('Formel', 'u(t) = û · sin(ωt) mit ω = 2πf'), ('Schritt 1', 'ω = 2π · 50 ≈ 314 s⁻¹'), ('Schritt 2', 'u(10 ms) = 325 · sin(2π · 50 · 0,010)'), ('Schritt 3', 'u = 325 · sin(π) = 0 V'), ('Ergebnis', 'u(t) = 0 V'), ('Merke', 'Bei genau einer halben Periodendauer ist der Sinuswert 0.')]),
 ('Oszilloskop', 8, ['Auf dem Oszilloskop wird eine Periodendauer von T = 20 ms gemessen.', 'Der Zeitversatz zwischen zwei Signalen beträgt Δt = 5 ms.', 'a) Berechne die Phasenverschiebung φ in Grad.', 'b) Berechne φ zusätzlich in Radiant.'],
  [('Formel', 'φ = (Δt / T) · 360°'), ('a)', 'φ = (5 ms / 20 ms) · 360° = 90°'), ('b)', 'φ = 90° · π / 180 ≈ 1,57 rad'), ('Merke', 'Zeitversatz im Verhältnis zur Periodendauer ergibt die Phase.')]),
 ('Kondensator', 6, ['Ein Kondensator hat C = 47 µF und wird mit f = 50 Hz betrieben.', 'Berechne den kapazitiven Blindwiderstand Xc.'],
  [('Formel', 'Xc = 1 / (2π · f · C)'), ('Rechnung', 'Xc = 1 / (2π · 50 · 47·10⁻⁶) ≈ 67,73 Ω'), ('Ergebnis', 'Xc ≈ 67,7 Ω'), ('Merke', 'Mit steigender Frequenz wird Xc kleiner.')]),
 ('Spule', 6, ['Eine Spule hat L = 80 mH und wird mit f = 50 Hz betrieben.', 'Berechne den induktiven Blindwiderstand XL.'],
  [('Formel', 'XL = 2π · f · L'), ('Rechnung', 'XL = 2π · 50 · 0,080 ≈ 25,13 Ω'), ('Ergebnis', 'XL ≈ 25,1 Ω'), ('Merke', 'Mit steigender Frequenz wird XL größer.')]),
 ('Reihenschaltung R + L', 4, ['Gegeben: R = 30 Ω und XL = 40 Ω.', 'Berechne den Scheinwiderstand Z und den Leistungsfaktor cos φ.'],
  [('Formeln', 'Z = √(R² + XL²) und cos φ = R / Z'), ('a)', 'Z = √(30² + 40²) = √2500 = 50 Ω'), ('b)', 'cos φ = 30 / 50 = 0,60'), ('Merke', 'In der Reihenschaltung bildet R zusammen mit XL ein rechtwinkliges Dreieck.')]),
 ('Druck / Hydraulik', 4, ['Auf einen Kolben mit A = 12 cm² wirkt ein Überdruck pe = 5 bar.', 'Berechne die Kraft F.'],
  [('Formel', 'F = p · A mit 1 bar = 10 N/cm²'), ('Umrechnung', 'pe = 5 bar = 50 N/cm²'), ('Rechnung', 'F = 50 · 12 = 600 N'), ('Ergebnis', 'F = 600 N'), ('Merke', 'Bei der Umrechnung in N/cm² muss die Fläche in cm² stehen.')]),
]
KURZ = [('Bogenmaß', 'α[rad] = α[°] · π / 180'), ('Winkeldreieck', 'sin α = GK / Hy &nbsp;|&nbsp; cos α = AK / Hy &nbsp;|&nbsp; tan α = GK / AK'),
        ('Wechselstrom', 'T = 1/f &nbsp;|&nbsp; ω = 2πf &nbsp;|&nbsp; Ueff = û / √2'), ('Augenblickswert', 'u(t) = û · sin(ωt)'),
        ('Kondensator', 'Xc = 1 / (2πfC)'), ('Spule', 'XL = 2πfL'), ('Druck', 'p = F / A &nbsp;|&nbsp; F = p · A')]

def mathe():
    body = ('<div class="meta-row"><div><b>Arbeitszeit</b>50 Minuten</div><div><b>Hilfsmittel</b>Taschenrechner, Lineal</div><div><b>Gesamt</b>60 Punkte</div></div>\n'
            '<div class="notice-box"><strong>Hinweis:</strong> Rechne sauber mit Formeln und schreibe bei jedem Ergebnis die Einheit dazu. '
            'Runde in der Regel auf 2 Dezimalstellen, wenn nichts anderes verlangt ist.</div>\n')
    jump = []
    for n, (titel, pkt, text, lsg) in enumerate(AUFGABEN, 1):
        rows = ''.join('<tr%s><td>%s</td><td>%s</td></tr>' % (' class="erg"' if k == 'Ergebnis' else '', k, html.escape(v)) for k, v in lsg)
        inhalt = '<ul>%s</ul><details class="loesung"><summary>Lösung zeigen</summary><div class="tbl-wrap"><table>%s</table></div></details>' % (
            ''.join('<li>%s</li>' % html.escape(t) for t in text), rows)
        body += wrap(str(n), html.escape(titel), inhalt, '%d P' % pkt, 'a%d' % n); jump.append(('a%d' % n, str(n)))
    body += wrap('', 'Kurzformeln zum Lernen', '<div class="tbl-wrap"><table>%s</table></div>' % ''.join('<tr><td><strong>%s</strong></td><td>%s</td></tr>' % kv for kv in KURZ), anker='kurzformeln')
    body += wrap('', 'Typische Fehler', '<ul><li>DEG und RAD verwechseln</li><li>Ueff mit û verwechseln</li><li>bei Kondensator und Spule die Vorzeichen der Phase vertauschen</li><li>bei Druck die Einheit bar nicht in N/cm² umrechnen</li></ul>', anker='fehler')
    seite('faecher/mathematik/probeschularbeit.html', 'am', 'Probeschularbeit Mathematik 2Md', '📝 Probeschularbeit mit Lösungen',
          'Bogenmaß · Winkeldreieck · Wechselstrom · Kondensator · Spule · R+L · Druck', 'Σ ∫ π', body, jump, 'Aufgabe',
          extra_nav='<button class="btn" id="sol-toggle" type="button">Alle Lösungen zeigen</button>')
    return sum(a[1] for a in AUFGABEN)


# ───────────────────────── AEE 3. Jahr (3Mb): Drehstrom, Einheit 1 + Arbeitsblatt Dreiphasenwechselspannung ─────────────────────────
import math

FIG_CSS = """
/* Abbildungen: Bilder bekommen einen hellen (Dunkelmodus: dunklen) Rahmen, Tafelbilder auf Schwarz werden im Hellmodus umgekehrt */
.fig{margin:.6rem auto 1rem;text-align:center}
.fig-row{display:flex;flex-wrap:wrap;gap:.9rem 1.2rem;justify-content:center;align-items:flex-start;margin:.6rem 0 1rem}
.fig-row .fig{margin:0;flex:0 1 auto;max-width:100%}
.bild{display:block;line-height:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff}
body.dark .bild{background:#000}
.bild img,.bild svg,.bild a{display:block;width:100%;height:auto}
body.dark .fig.hell img{filter:invert(1) hue-rotate(180deg)}
body:not(.dark) .fig.dunkel img{filter:invert(1) hue-rotate(180deg)}
.fig figcaption{font-size:.8rem;color:var(--muted);margin:.4rem auto 0;line-height:1.4;max-width:34rem}
/* Lösungstabellen (zwei Spalten): auf schmalen Bildschirmen steht die Beschriftung über der Rechnung */
@media(max-width:560px){table.lsg,table.lsg tbody,table.lsg tr,table.lsg td{display:block;width:auto}table.lsg tr{border-top:1px solid var(--border);padding:.4rem 0}table.lsg tr:first-child{border-top:0}table.lsg td{border:0;padding:.05rem .5rem}details.loesung table.lsg td:first-child{width:auto;white-space:normal;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}}
"""

SV_CSS = """/* eigene Diagramme (SVG) */
.fig.svg .bild,body.dark .fig.svg .bild{display:block;background:var(--card)}
.fig-row .fig.svg{flex:1 1 230px;max-width:330px}
.fig-row .fig.svg.breit{flex:2 1 400px;max-width:640px}
.sv .g{stroke:var(--muted);stroke-width:1;opacity:.3;fill:none}
.sv .ax{stroke:var(--muted);stroke-width:1.4;fill:none}
.sv .af{fill:var(--muted);stroke:none}
.sv .tx{fill:var(--muted);font:500 15px 'JetBrains Mono',monospace;paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round}
.sv .k1{--k:#2563eb}.sv .k2{--k:#d97706}.sv .k3{--k:#059669}
body.dark .sv .k1{--k:#60a5fa}body.dark .sv .k2{--k:#fbbf24}body.dark .sv .k3{--k:#34d399}
.sv .ln{fill:none;stroke:var(--k);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.sv .pf{fill:var(--k);stroke:none}
.sv .ring{fill:none;stroke:var(--k);stroke-width:2}
.sv .lb{fill:var(--k);font:700 21px Inter,sans-serif;paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round}
.sv .mk{stroke:var(--muted);stroke-width:1.2;stroke-dasharray:4 4;fill:none}
.vorteile li{margin-bottom:.45rem}
@media(max-width:560px){.sv.lin .tx{font-size:22px;stroke-width:5px}.sv.lin .lb{font-size:29px}.sv.lin .ln{stroke-width:3.4}}
"""
AEE3_CSS = FIG_CSS + SV_CSS

def _f(x):
    return '%.1f' % x

def _pfeil(x0, y0, x1, y1, kl='ax', fl='af', sz=9):
    """Linie mit Pfeilspitze (Spitze als Dreieck gezeichnet, damit keine marker-IDs nötig sind)"""
    a = math.atan2(y1 - y0, x1 - x0)
    bx, by = x1 - sz * math.cos(a), y1 - sz * math.sin(a)
    px, py = -math.sin(a) * sz * .4, math.cos(a) * sz * .4
    return ('<line class="%s" x1="%s" y1="%s" x2="%s" y2="%s"/><polygon class="%s" points="%s,%s %s,%s %s,%s"/>'
            % (kl, _f(x0), _f(y0), _f(bx), _f(by), fl, _f(x1), _f(y1), _f(bx + px), _f(by + py), _f(bx - px), _f(by - py)))

UH = 325  # Scheitelwert in V (Arbeitsblatt)
PHASEN = ((1, 0, 'u₁'), (2, 120, 'u₂'), (3, 240, 'u₃'))   # (Nr, Nacheilung in °, Name)

def diagramm_linien(pid, alle=True, marke=False):
    """Liniendiagramm der Strangspannungen über α; alle=False zeigt nur u₁ (Aufgabenstellung), marke=True markiert α = 150°"""
    W, H, x0, x1, yc, A = 640, 304, 74, 586, 152, 112
    X = lambda a: x0 + (x1 - x0) * a / 360
    Y = lambda u: yc - A * u / UH
    namen = 'u₁, u₂ und u₃' if alle else 'u₁'
    o = ['<svg class="sv lin" viewBox="0 0 %d %d" role="img" aria-labelledby="%s-t"><title id="%s-t">Liniendiagramm der Spannung %s über dem Winkel α in Grad, Scheitelwert 325 V</title>' % (W, H, pid, pid, namen)]
    for a in range(0, 361, 30):
        o.append('<line class="g" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (_f(X(a)), _f(Y(UH) - 10), _f(X(a)), _f(Y(-UH) + 10)))
    for u in (UH, UH / 2, -UH / 2, -UH):
        o.append('<line class="g" x1="%s" y1="%s" x2="%s" y2="%s"/>' % (_f(x0), _f(Y(u)), _f(x1 + 6), _f(Y(u))))
    o.append(_pfeil(x0 - 8, yc, x1 + 22, yc))
    o.append(_pfeil(x0, Y(-UH) + 14, x0, Y(UH) - 24))
    for a in (0, 90, 180, 270, 360):
        o.append('<text class="tx" x="%s" y="%s" text-anchor="middle">%d</text>' % (_f(X(a)), _f(Y(-UH) + 28), a))
    for u, t in ((UH, '325'), (0, '0'), (-UH, '−325')):
        o.append('<text class="tx" x="%s" y="%s" text-anchor="end">%s</text>' % (_f(x0 - 8), _f(Y(u) + 4), t))
    o.append('<text class="tx" x="%s" y="%s" text-anchor="start">u in V</text>' % (_f(x0 + 10), _f(Y(UH) - 20)))
    o.append('<text class="tx" x="%d" y="%s" text-anchor="end">α in °</text>' % (W - 6, _f(yc + 26)))
    for k, ph, nm in (PHASEN if alle else PHASEN[:1]):
        pts = ' '.join('%s,%s' % (_f(X(a)), _f(Y(UH * math.sin(math.radians(a - ph))))) for a in range(0, 361, 3))
        o.append('<g class="k%d"><polyline class="ln" points="%s"/><text class="lb" x="%s" y="%s">%s</text></g>'
                 % (k, pts, _f(X(90 + ph if 90 + ph <= 360 else 90 + ph - 360) + 10), _f(Y(UH) - 7), nm))
    if marke:
        xm = X(150)
        o.append('<line class="mk" x1="%s" y1="%s" x2="%s" y2="%s"/><text class="tx" x="%s" y="%s" text-anchor="middle">α = 150°</text>'
                 % (_f(xm), _f(Y(UH) - 14), _f(xm), _f(Y(-UH) + 12), _f(xm), _f(Y(UH) - 20)))
        for k, ph, nm in PHASEN:
            yv = Y(UH * math.sin(math.radians(150 - ph)))
            o.append('<g class="k%d">%s</g>' % (k, '<circle class="pf" cx="%s" cy="%s" r="4.5"/>' % (_f(xm), _f(yv)) if k != 2 else '<circle class="ring" cx="%s" cy="%s" r="8"/>' % (_f(xm), _f(yv))))
    o.append('</svg>')
    return ''.join(o)

def diagramm_zeiger(pid, alle=True):
    """Zeigerbild (Kreisdiagramm): u₁ bei 0°, u₂ 120° und u₃ 240° im Uhrzeigersinn dahinter; alle Zeiger Länge Û = 325 V"""
    W = H = 300; cx = cy = 150; R = 104
    P = lambda ang, r=R: (cx + r * math.cos(math.radians(ang)), cy - r * math.sin(math.radians(ang)))
    namen = 'u₁, u₂ und u₃' if alle else 'u₁'
    o = ['<svg class="sv" viewBox="0 0 %d %d" role="img" aria-labelledby="%s-t"><title id="%s-t">Zeigerbild der Spannung %s, Länge des Zeigers entspricht 325 V</title>' % (W, H, pid, pid, namen),
         '<circle class="g" cx="%d" cy="%d" r="%d"/>' % (cx, cy, R),
         '<line class="g" x1="%d" y1="%d" x2="%d" y2="%d"/><line class="g" x1="%d" y1="%d" x2="%d" y2="%d"/>' % (cx - R - 16, cy, cx + R + 16, cy, cx, cy - R - 16, cx, cy + R + 16)]
    for k, ph, nm in (PHASEN if alle else PHASEN[:1]):
        tx, ty = P(-ph)
        lx, ly = P(-ph, R + 17)
        o.append('<g class="k%d">%s<text class="lb" x="%s" y="%s" text-anchor="middle">%s</text></g>'
                 % (k, _pfeil(cx, cy, tx, ty, 'ln', 'pf', 11), _f(lx), _f(ly + 5), nm))
    if alle:
        for a1, a2, am in ((-10, -110, -60), (-130, -230, -180), (-250, -350, -300)):
            (x1, y1), (x2, y2), (mx, my) = P(a1, 32), P(a2, 32), P(am, 56)
            o.append('<path class="ax" d="M %s %s A 32 32 0 0 1 %s %s"/><text class="tx" x="%s" y="%s" text-anchor="middle">120°</text>' % (_f(x1), _f(y1), _f(x2), _f(y2), _f(mx), _f(my + 4)))
    o.append('<text class="tx" x="%s" y="%s" text-anchor="end">Û = 325 V</text>' % (_f(cx + R + 8), _f(cy - 10)))
    o.append('</svg>')
    return ''.join(o)

def fig(src, alt, cap, art='hell', breite=None, w=None, h=None):
    """Bild mit Beschriftung; art='hell': Zeichnung auf weißem Grund, 'dunkel': Tafelbild auf Schwarz (wird dem Design angepasst)"""
    mw = breite or w
    st = ' style="width:min(100%%,%dpx)"' % mw if mw else ''
    wh = ' width="%d" height="%d"' % (w, h) if w and h else ''
    return ('<figure class="fig %s"%s><div class="bild"><a href="bilder/%s" target="_blank" rel="noopener" title="Bild in voller Größe öffnen"><img src="bilder/%s" alt="%s"%s loading="lazy"></a></div><figcaption>%s</figcaption></figure>'
            % (art, st, src, src, html.escape(alt, quote=True), wh, cap))

def fig_svg(svg, cap, breit=False):
    return '<figure class="fig svg%s"><div class="bild">%s</div><figcaption>%s</figcaption></figure>' % (' breit' if breit else '', svg, cap)

def loesung(inhalt):
    return '<details class="loesung"><summary>Lösung zeigen</summary><div class="sum-body md-out">%s</div></details>' % inhalt

def aee3():
    # ── Seite 1: Einheit 1 · Drehstrom (aus den Unterrichtsnotizen) ──
    b = ''
    b += wrap('1', 'Was ist Drehstrom?',
              '<p>Drehstrom wird aus Wasser- und Windkraft oder aus thermischer Energie mit <strong>Synchronmaschinen</strong> erzeugt. '
              'Mit <strong>Wechselrichtern</strong> kann Drehstrom auch aus Gleichstrom (Photovoltaik, Batterien) umgewandelt werden.</p>', anker='s1')
    b += wrap('2', 'Dreiphasengenerator (Synchrongenerator)',
              '<div class="fig-row">' +
              fig('generator-staender.png', 'Ständer des Generators mit drei Spulen U1–U2, V1–V2 und W1–W2, die jeweils 120° auseinanderliegen; in der Mitte das drehende Polpaar',
                  'Ständer mit drei Spulen, räumlich um 120° versetzt', 'hell', w=337, h=297) +
              fig('generator-polrad.png', 'Schnitt durch den Generator: Das Polrad mit Nord- und Südpol dreht sich im Ständer, die Spulenseiten U1/U2, V1/V2 und W1/W2 liegen 120° auseinander',
                  'Das Polpaar (N/S) dreht sich im Ständer', 'hell', w=296, h=302) +
              '</div>'
              '<ul>'
              '<li>Bei jeder Drehung des Polpaares wird in jeder Spule eine Wechselspannung induziert.</li>'
              '<li>Die Spulen sind räumlich um <strong>120°</strong> versetzt.</li>'
              '<li>Die Wechselspannungen sind gleich groß und haben die gleiche Frequenz, sind aber um <strong>⅓ Periode, also 120°</strong>, zueinander phasenverschoben.</li>'
              '<li>Die 3 Strangspannungen sind vollkommen gleichwertig.</li>'
              '</ul>'
              '<p class="fnote" style="font-size:.8rem;color:var(--muted)">Strang = eine der drei Spulen; Strangspannung = die Spannung an einer Spule.</p>', anker='s2')
    b += wrap('3', 'Zeigerbild und Liniendiagramm',
              fig('strangspannungen-zeiger-linien.png',
                  'Links das Kreisdiagramm: drei Zeiger U Str 1, U Str 2 und U Str 3, jeweils 120° auseinander. Rechts das Liniendiagramm: drei gleiche Sinuskurven über dem Winkel, gegeneinander um 120° verschoben',
                  'Links: Kreisdiagramm (Zeigerbild) · rechts: Liniendiagramm der drei Strangspannungen U<sub>Str1</sub>, U<sub>Str2</sub>, U<sub>Str3</sub>', 'hell', w=947, h=330) +
              '<div class="info-box"><strong>Die Summe der drei Strangspannungen ist zu jedem Zeitpunkt gleich null.</strong></div>' +
              fig('zeiger-summe-null.png',
                  'Handskizze: Die drei Zeiger U Str 1, U Str 2 und U Str 3 mit Spitze an Fuß aneinandergelegt bilden ein geschlossenes Dreieck',
                  'Die Zeiger aneinandergelegt (Spitze an Fuß) schließen sich zu einem Dreieck: Die Summe ist 0.', 'dunkel', breite=300, w=461, h=307), anker='s3')
    b += wrap('4', 'Verkettung: Stern und Dreieck',
              '<p>Die drei Stränge werden praktisch immer <strong>verkettet</strong>, dadurch ergeben sich besondere Vorteile.</p>'
              '<p>Es gibt <strong>2 Möglichkeiten</strong> der Verkettung:</p>'
              '<h3>Sternschaltung</h3>'
              '<div class="fig-row">' +
              fig('sternschaltung.png', 'Schaltbild der Sternschaltung: Die Spulenanfänge U1, V1, W1 liegen an den Leitungen L1, L2, L3, die Spulenenden U2, V2, W2 sind im Sternpunkt verbunden',
                  'Schaltbild: Anfänge U1, V1, W1 an L1, L2, L3', 'hell', breite=300, w=715, h=671) +
              fig('stern-verbindung.png', 'Handskizze: Die Enden W2, U2 und V2 werden miteinander verbunden',
                  'Verbindung: Die Enden W2, U2, V2 werden zum Sternpunkt zusammengeschlossen', 'dunkel', breite=300, w=475, h=262) +
              '</div>'
              '<h3>Dreieckschaltung</h3>'
              '<div class="fig-row">' +
              fig('dreieckschaltung.png', 'Schaltbild der Dreieckschaltung: Die drei Spulen bilden ein Dreieck, an den Ecken liegen die Leitungen L1, L2, L3',
                  'Schaltbild: An den Ecken liegen L1, L2, L3', 'hell', breite=300, w=857, h=714) +
              fig('dreieck-verbindung.png', 'Handskizze: Das Ende jeder Spule wird mit dem Anfang der nächsten verbunden, also W2 mit U1, U2 mit V1 und V2 mit W1',
                  'Verbindung: Ende einer Spule an den Anfang der nächsten (W2–U1, U2–V1, V2–W1)', 'dunkel', breite=300, w=477, h=335) +
              '</div>'
              '<h3>Unverkettet und verkettet im Vergleich</h3>' +
              fig('verkettung-vergleich.png',
                  'Oben der unverkettete Dreiphasenstrom: drei getrennte Stromkreise mit je zwei Leitungen. Unten der verkettete Dreiphasenstrom: die drei Stromkreise teilen sich eine gemeinsame Rückleitung',
                  'Oben: unverketteter Dreiphasenstrom (drei getrennte Stromkreise) · unten: verketteter Dreiphasenstrom (gemeinsame Rückleitung)', 'dunkel', breite=640, w=1282, h=524), anker='s4')
    b += wrap('5', 'Drehstrom und seine Vorteile',
              '<div class="info-box"><strong>Drehstrom ist ein verketteter Dreiphasenwechselstrom.</strong></div>'
              '<h3>Vorteile</h3>'
              '<ul class="vorteile">'
              '<li>Generatoren und Transformatoren sind kleiner als Wechselstromgeräte gleicher Leistung.</li>'
              '<li>Bei der Übertragung großer Leistungen spart man 50 % Leitungsmaterial.</li>'
              '<li>Drehstrommotoren lassen sich besonders günstig herstellen.</li>'
              '<li>Im Drehstromnetz stehen 2 Spannungen zur Verfügung: einphasige und dreiphasige Verbraucher können angeschlossen werden.</li>'
              '</ul>', anker='s5')
    kurz = [('Erzeugung', 'Synchrongenerator: Das Polrad dreht sich im Ständer mit drei Spulen'),
            ('Versatz', 'Spulen räumlich 120°, Spannungen zeitlich ⅓ Periode = 120°'),
            ('Eigenschaften', 'gleich groß, gleiche Frequenz, vollkommen gleichwertig'),
            ('Summe', 'u₁ + u₂ + u₃ = 0 zu jedem Zeitpunkt'),
            ('Verkettung', 'Sternschaltung oder Dreieckschaltung')]
    b += wrap('', 'Kurz gemerkt', '<div class="tbl-wrap"><table>%s</table></div>' % ''.join('<tr><td><strong>%s</strong></td><td>%s</td></tr>' % kv for kv in kurz), anker='merker')
    seite('faecher/aee/drehstrom-einheit-1.html', 'aee', 'AEE3 — Einheit 1: Drehstrom', '⚡ 3Mb · Einheit 1',
          'Entstehung · 120° Phasenverschiebung · Zeigerbild und Liniendiagramm · Verkettung in Stern und Dreieck · Vorteile',
          'L1 L2 L3', b, [('s1', '1'), ('s2', '2'), ('s3', '3'), ('s4', '4'), ('s5', '5'), ('merker', 'Merker')], 'Abschnitt', extra_css=AEE3_CSS)

    # ── Seite 2: Arbeitsblatt Dreiphasenwechselspannung (Aufgaben aus dem Arbeitsblatt, Lösungen als Vorschlag) ──
    t = ''
    t += ('<div class="info-box"><strong>Information:</strong> Die Elektroenergieversorgung erfolgt weltweit meistens mithilfe von Drehstromsystemen. '
          'In Drehstromsystemen werden drei Wechselspannungen gemeinsam übertragen.</div>\n'
          '<div class="notice-box"><strong>Hinweis:</strong> Die Aufgaben stammen aus dem Arbeitsblatt „Dreiphasenwechselspannung“ (AEE, 3Mb). '
          'Die Lösungen sind eigene Lösungsvorschläge, bei Abweichungen gilt die Lösung aus dem Unterricht. '
          'Hintergrund und Schaltbilder findest du in <a href="drehstrom-einheit-1.html">Einheit 1: Drehstrom</a>.</div>\n')
    t += wrap('1', 'Entstehung einer Dreiphasenwechselspannung',
              '<p>Beschreiben Sie mithilfe von Bild die Entstehung einer Dreiphasenwechselspannung.</p>' +
              fig('generator-staender.png', 'Dreiphasengenerator: Ständer mit drei um 120° versetzten Spulen U1–U2, V1–V2, W1–W2 und drehendes Polpaar',
                  'Bild: Dreiphasengenerator', 'hell', breite=300, w=337, h=297) +
              loesung('<ul>'
                      '<li>Im <strong>Ständer</strong> sitzen drei Spulen (U1–U2, V1–V2, W1–W2), räumlich um <strong>120°</strong> versetzt.</li>'
                      '<li>Das <strong>Polrad</strong> (drehbarer Magnet mit Nord- und Südpol) wird angetrieben und dreht sich im Ständer.</li>'
                      '<li>Das umlaufende Magnetfeld induziert in jeder Spule eine Wechselspannung (Induktionsgesetz).</li>'
                      '<li>Weil die Spulen um 120° versetzt sind, erreicht jede Spannung ihren Höchstwert zeitlich nacheinander: '
                      'Es entstehen drei Wechselspannungen, die um 120° (⅓ Periode) gegeneinander phasenverschoben sind.</li></ul>'), anker='a1')
    t += wrap('2', 'Eigenschaften der drei Spannungen',
              '<p>Welche Eigenschaften haben die drei Spannungen u₁, u₂ und u₃ eines Drehstromsystems?</p>' +
              loesung('<ul>'
                      '<li>gleich groß (gleicher Scheitelwert Û₁ = Û₂ = Û₃)</li>'
                      '<li>gleiche Frequenz</li>'
                      '<li>gegeneinander um 120° (⅓ Periode) phasenverschoben</li>'
                      '<li>die Summe der Augenblickswerte ist zu jedem Zeitpunkt 0 V</li>'
                      '<li>vollkommen gleichwertig</li></ul>'), anker='a2')
    t += wrap('3', 'Spannungsgleichung für u₃',
              '<p>Wie lautet die Spannungsgleichung für u₃?</p><p>Gegeben:</p>'
              '<div class="formula-box">u₁ = Û₁ · sin α<br>u₂ = Û₂ · sin(α − 120°)</div>' +
              loesung('<div class="formula-box">u₃ = Û₃ · sin(α − 240°)</div>'
                      '<p>Jede Spannung eilt der vorigen um weitere 120° nach, bei u₃ sind es 240°. '
                      'Mit Û₁ = Û₂ = Û₃ = Û und sin(α − 240°) = sin(α + 120°) kann man auch u₃ = Û · sin(α + 120°) schreiben.</p>'), anker='a3')
    t += wrap('4', 'Liniendiagramm und Zeigerbild',
              '<p>Ergänzen Sie im Bild die Spannungen u₂ und u₃ einer Dreiphasenwechselspannung als:</p>'
              '<ul><li>a) Liniendiagramm</li><li>b) Zeigerbild</li></ul><p>Der Maximalwert Û beträgt jeweils 325 V.</p>'
              '<div class="fig-row">' + fig_svg(diagramm_linien('a4-aufgabe-l', alle=False), 'Liniendiagramm (u₁ vorgegeben)', breit=True)
              + fig_svg(diagramm_zeiger('a4-aufgabe-z', alle=False), 'Zeigerbild (u₁ vorgegeben)') + '</div>' +
              loesung('<div class="fig-row">' + fig_svg(diagramm_linien('a4-lsg-l'), 'Liniendiagramm: u₂ ist um 120° nach rechts verschoben, u₃ um 240°', breit=True)
                      + fig_svg(diagramm_zeiger('a4-lsg-z'), 'Zeigerbild: drei gleich lange Zeiger (Û = 325 V), jeweils 120° auseinander') + '</div>'
                      '<ul>'
                      '<li><strong>u₂</strong>: steigender Nulldurchgang bei 120°, Maximum bei 210°, Minimum bei 30°.</li>'
                      '<li><strong>u₃</strong>: steigender Nulldurchgang bei 240°, Maximum bei 330°, Minimum bei 150°.</li>'
                      '<li>Im Zeigerbild drehen die Zeiger gegen den Uhrzeigersinn; u₂ liegt 120° und u₃ 240° im Uhrzeigersinn hinter u₁ (nacheilend).</li></ul>'), anker='a4')
    rows = [('Gegeben', 'Û = 325 V und α = 150°'),
            ('u₁', 'u₁ = Û · sin α = 325 V · sin 150° = 325 V · 0,5 = 162,5 V'),
            ('u₂', 'u₂ = Û · sin(α − 120°) = 325 V · sin 30° = 162,5 V'),
            ('u₃', 'u₃ = Û · sin(α − 240°) = 325 V · sin(−90°) = −325 V'),
            ('Ergebnis', 'u₁ + u₂ + u₃ = 162,5 V + 162,5 V − 325 V = 0 V')]
    tab = ''.join('<tr%s><td>%s</td><td>%s</td></tr>' % (' class="erg"' if k == 'Ergebnis' else '', k, v) for k, v in rows)
    t += wrap('5', 'Momentanwerte bei α = 150°',
              '<p>Berechnen Sie für den Zeitpunkt α = 150° aus voriger Aufgabe die Momentanwerte für u₁, u₂ und u₃, anschließend die Summe der drei Momentanwerte.</p>' +
              loesung('<div class="tbl-wrap"><table class="lsg">%s</table></div>' % tab +
                      fig_svg(diagramm_linien('a5-lsg-l', marke=True), 'Bei α = 150° sind u₁ und u₂ gleich groß (162,5 V), u₃ steht im Minimum (−325 V).', breit=True) +
                      '<p>Die Summe ist 0 V, wie es für jede Dreiphasenwechselspannung gilt.</p>'), anker='a5')
    t += wrap('6', 'Verkettungsarten',
              '<p>Die Summe der Momentanwerte der drei Wechselspannungen ist immer gleich 0 V. Die drei Wechselspannungen werden meistens zusammengeschaltet (verkettet). '
              'Nennen Sie die beiden in der Drehstromtechnik verwendeten Verkettungsarten.</p>' +
              loesung('<ul><li><strong>Sternschaltung</strong>: die Spulenenden U2, V2, W2 werden im Sternpunkt verbunden.</li>'
                      '<li><strong>Dreieckschaltung</strong>: das Ende jeder Spule wird mit dem Anfang der nächsten verbunden (U2–V1, V2–W1, W2–U1).</li></ul>'
                      '<p>Schaltbilder: <a href="drehstrom-einheit-1.html#s4">Einheit 1, Abschnitt 4</a>.</p>'), anker='a6')
    seite('faecher/aee/dreiphasenwechselspannung.html', 'aee', 'AEE3 — Dreiphasenwechselspannung', '📝 Arbeitsblatt · 6 Aufgaben mit Lösungsvorschlägen',
          'Entstehung · Eigenschaften · Spannungsgleichung · Liniendiagramm und Zeigerbild · Momentanwerte · Verkettung',
          'u = Û · sin α', t, [('a%d' % n, str(n)) for n in range(1, 7)], 'Aufgabe',
          extra_nav='<button class="btn" id="sol-toggle" type="button">Alle Lösungen zeigen</button>', extra_css=AEE3_CSS)


# ───────────────────────── AM 3. Jahr (3Mb): Pneumatik – Grundlagen (aus dem Arbeitsblatt, Lösungen als Vorschlag) ─────────────────────────
def de(x, nd=1):
    """Zahl im deutschen Format: Komma als Dezimalzeichen, geschütztes Leerzeichen als Tausendertrenner ab fünf Stellen"""
    t = ('%.*f' % (nd, abs(x))).replace('.', ',')
    a, _, b = t.partition(',')
    if len(a) > 4:
        a = ' '.join(reversed([a[max(0, i - 3):i] for i in range(len(a), 0, -3)]))
    return ('−' if x < 0 and float(t.replace(',', '.')) != 0 else '') + a + (',' + b if b else '')

def zeilen(rows):
    """Lösungstabelle: (Beschriftung, Text[, 'erg']) – Ergebniszeilen werden hervorgehoben"""
    return '<div class="tbl-wrap"><table class="lsg">%s</table></div>' % ''.join(
        '<tr%s><td>%s</td><td>%s</td></tr>' % (' class="erg"' if len(r) > 2 else '', r[0], r[1]) for r in rows)

def pneu():
    kreis = lambda D: math.pi / 4 * D * D                 # Kreisfläche in mm²
    ring = lambda D, d: math.pi / 4 * (D * D - d * d)      # Ringfläche in mm²
    PA = lambda bar: bar / 10                              # 1 bar = 0,1 N/mm²

    # ── Beispiel 1: einfach wirkender Zylinder D = 32 mm, 5 bar, η = 92 % ──
    a1 = kreis(32); f1th = PA(5) * a1; f1 = f1th * .92
    # ── Beispiel 2: Einfahren, F = 350 N, 5,5 bar, η = 88 %, Bild: D = 32 mm, d = 10 mm ──
    a2_erf = 350 / (PA(5.5) * .88); d2 = math.sqrt(4 * a2_erf / math.pi + 10 ** 2); a2 = ring(32, 10); f2 = PA(5.5) * a2 * .88
    # ── Beispiel 3: Spannstock, D = 140 mm, 6 bar, η = 88 %, l1 = 150 mm, l2 = 50 mm ──
    a3 = kreis(140); f3a = PA(6) * a3 * .88; f3b = f3a * 150 / 50
    # ── Beispiel 4: Zangengreifer, 4,5 bar, F = 120 N, D = 25 mm, η = 92 % → Stangendurchmesser d ──
    a4r = 120 / (PA(4.5) * .92); a4k = kreis(25); a4s = a4k - a4r; d4 = math.sqrt(4 * a4s / math.pi)
    # ── Übung 1: a–c ──
    u1 = [(n, D, pe, kreis(D), PA(pe) * kreis(D), PA(pe) * kreis(D) * .85) for n, D, pe in (('a', 80, 6), ('b', 63, 8), ('c', 50, 4))]
    # ── Übung 2: Rückstelldruck 0,5 bar, D = 25 mm, d = 10 mm, η = 90 % ──
    a_u2 = ring(25, 10); f_u2 = PA(0.5) * a_u2 * .90
    # ── Übung 3: 63 × 20 × 125, η = 85 %, F = 1480 N in beiden Richtungen ──
    a_v = kreis(63); a_r = ring(63, 20); p_v = 1480 / (a_v * .85); p_r = 1480 / (a_r * .85)
    # ── Übung 4: Spannvorrichtung, D = 32 mm, 5,0 bar, η = 0,87, i = 2,8 : 1 ──
    a_u4 = kreis(32); f_u4a = PA(5) * a_u4 * .87; f_u4b = f_u4a * 2.8
    print('Kontrollwerte  B1 F=%.2f  B2 A=%.2f D=%.2f F=%.2f  B3 F1=%.1f F2=%.1f  B4 d=%.3f  U2 F=%.2f  U3 p=%.3f/%.3f bar  U4 F1=%.2f F2=%.2f'
          % (f1, a2_erf, d2, f2, f3a, f3b, d4, f_u2, p_v * 10, p_r * 10, f_u4a, f_u4b))

    sub = lambda t, i: '%s<sub>%s</sub>' % (t, i)
    b = ''
    b += wrap('1', 'Was ist Pneumatik?',
              '<p>Die Pneumatik beschäftigt sich mit der Erzeugung, Aufbereitung, Steuerung und Nutzung von <strong>Druckluft</strong>.</p>'
              '<p>Druckluft wird verwendet, um Bewegungen und Kräfte zu erzeugen. Sie dient beispielsweise dazu, Werkstücke zu spannen, Bauteile zu transportieren oder Werkzeuge anzutreiben.</p>'
              '<h3>Vorteile der Pneumatik</h3><ul>'
              '<li>Druckluft ist relativ einfach verfügbar.</li><li>Hohe Arbeitsgeschwindigkeiten sind möglich.</li><li>Pneumatische Anlagen sind robust.</li>'
              '<li>Einfache Steuerung und Automatisierung.</li><li>Keine elektrische Energie am pneumatischen Antrieb erforderlich.</li></ul>'
              '<h3>Nachteile der Pneumatik</h3><ul>'
              '<li>Druckluft ist relativ teuer in der Erzeugung.</li><li>Luft ist kompressibel (zusammendrückbar).</li><li>Bewegungen lassen sich schwieriger exakt positionieren.</li>'
              '<li>Geräuschentwicklung durch ausströmende Luft.</li><li>Kraft ist im Vergleich zu hydraulischen Antrieben begrenzt.</li></ul>', anker='s1')
    tab = [('Druck', 'p', 'Pascal (Pa), bar'), ('Kraft', 'F', 'Newton (N)'), ('Fläche', 'A', 'm²'), ('Volumen', 'V', 'm³, Liter'), ('Temperatur', 'T', 'Kelvin (K)'),
           ('Volumenstrom', 'Q', 'm³/s, l/min'), ('Weg', 's', 'Meter (m)'), ('Geschwindigkeit', 'v', 'm/s')]
    b += wrap('2', 'Physikalische Grundlagen',
              '<p>Für die Pneumatik sind einige physikalische Größen besonders wichtig.</p>'
              '<div class="tbl-wrap"><table><tr><th>Größe</th><th>Formelzeichen</th><th>Einheit</th></tr>%s</table></div>'
              % ''.join('<tr><td><strong>%s</strong></td><td>%s</td><td>%s</td></tr>' % r for r in tab), anker='s2')
    b += wrap('3', 'Druck',
              '<p>Der Druck gibt an, mit welcher Kraft auf eine bestimmte Fläche gedrückt wird.</p>'
              '<h3>Formel</h3><div class="formula-box">p = F / A</div>'
              '<p>Dabei gilt:</p><ul><li>p = Druck in Pascal (Pa)</li><li>F = Kraft in Newton (N)</li><li>A = Fläche in Quadratmeter (m²)</li></ul>'
              '<h3>Wichtige Umrechnungen</h3>'
              '<div class="formula-box">1 bar = 100 000 Pa<br>1 bar = 0,1 MPa<br>1 MPa = 10 bar<br>1 bar = 100 kPa</div>'
              '<div class="info-box"><strong>Zum Rechnen:</strong> 1 bar = 10 N/cm² = 0,1 N/mm². Rechnet man die Fläche in mm² und den Druck in N/mm² '
              '(5 bar = 0,5 N/mm²), erhält man die Kraft direkt in Newton.</div>', anker='s3')
    b += wrap('4', 'Kolbenkraft',
              '<p>Die in den Pneumatikzylinder einströmende Druckluft übt auf die Kolbenfläche einen Druck aus. Dadurch wird der Kolben gemeinsam mit der Kolbenstange bewegt. '
              'Es entsteht die <strong>theoretische Kolbenkraft</strong>:</p>'
              '<div class="formula-box">%s = %s · A</div>' % (sub('F', 'th'), sub('p', 'e')) +
              fig('pneumatik-kolbenkraft.jpg', 'Pneumatikzylinder im Schnitt: Der Überdruck pe wirkt auf die Kolbenfläche A und erzeugt die theoretische Kolbenkraft Fth; Reibungskräfte FR mindern sie zur wirksamen Kolbenkraft F',
                  'Theoretische Kolbenkraft F<sub>th</sub>, Reibungskräfte F<sub>R</sub> und wirksame Kolbenkraft F', 'hell', breite=520, w=1013, h=562) +
              '<p>In der Praxis treten Reibungsverluste zwischen Kolben, Kolbenstange, Dichtungen und Zylinderwand auf. Deshalb ist die tatsächlich nutzbare Kolbenkraft kleiner als die theoretische Kolbenkraft. '
              'Diese Verluste werden durch den <strong>Wirkungsgrad η</strong> berücksichtigt:</p>'
              '<div class="formula-box">F = %s · A · η</div>' % sub('p', 'e') +
              '<div class="info-box"><strong>Rechenhilfe (für die Beispiele):</strong><br>Kolbenfläche: A = π/4 · D²<br>'
              'Ringfläche beim Einfahren des doppelt wirkenden Zylinders: A = π/4 · (D² − d²)<br>'
              'D = Kolbendurchmesser, d = Kolbenstangendurchmesser, pe = Überdruck</div>', anker='s4')

    # ── Beispiele ──
    b += wrap('B1', 'Einfach wirkender Zylinder',
              '<p>Wie groß ist die wirksame Kolbenkraft, wenn der einfach wirkende Zylinder mit Kolbendurchmesser 32 mm mit einem Überdruck von 5 bar beaufschlagt wird? Der Wirkungsgrad beträgt 92 %.</p>' +
              fig('zylinder-einfach-wirkend.jpg', 'Einfach wirkender Zylinder mit Kolbendurchmesser 32 mm, Druckfeder, Manschettendichtung, Entlüftung und Schaltzeichen',
                  'Einfach wirkender Zylinder (ø32 mm)', 'hell', breite=420, w=714, h=393) +
              loesung(zeilen([('Gegeben', 'D = 32 mm, pe = 5 bar = 0,5 N/mm², η = 0,92'),
                              ('Fläche', 'A = π/4 · D² = π/4 · (32 mm)² = %s mm²' % de(a1)),
                              ('Theoretisch', 'F<sub>th</sub> = pe · A = 0,5 N/mm² · %s mm² = %s N' % (de(a1), de(f1th))),
                              ('Ergebnis', 'F = F<sub>th</sub> · η = %s N · 0,92 ≈ %s N' % (de(f1th), de(f1, 0)), 'erg')])), 'Beispiel 1', anker='b1')
    b += wrap('B2', 'Einfahren eines doppelt wirkenden Zylinders',
              '<p>Beim Einfahren eines doppelt wirkenden Zylinders soll eine Kraft von F = 350 N erzeugt werden. Der Druck beträgt pe = 5,5 bar. Der Wirkungsgrad beträgt 88 %.</p>' +
              fig('zylinder-einfahren.jpg', 'Doppelt wirkender Zylinder beim Einfahren mit der Kraft F; daneben die Ansicht auf Kolbenstange mit 10 mm und Kolben mit 32 mm Durchmesser',
                  'Doppelt wirkender Zylinder beim Einfahren: Kolbenstange ø10 mm, Kolben ø32 mm', 'hell', breite=560, w=926, h=318) +
              loesung('<p>Das Arbeitsblatt nennt keine Frage. Aus den Zahlen und dem Bild bietet sich an: Welcher Kolbendurchmesser ist nötig, und wird mit den Maßen im Bild (ø32 mm, Stange ø10 mm) die Kraft erreicht? '
                      'Beim Einfahren wirkt der Druck nur auf die <strong>Ringfläche</strong>.</p>' +
                      zeilen([('Gegeben', 'F = 350 N, pe = 5,5 bar = 0,55 N/mm², η = 0,88, Kolbenstange d = 10 mm'),
                              ('Ringfläche', 'A = F / (pe · η) = 350 N / (0,55 N/mm² · 0,88) = %s mm²' % de(a2_erf)),
                              ('Durchmesser', 'D² = 4A/π + d² = %s mm² + 100 mm² → D = %s mm ≈ 32 mm' % (de(4 * a2_erf / math.pi), de(d2)), 'erg'),
                              ('Probe', 'ø32/ø10: A = π/4 · (32² − 10²) mm² = %s mm²; F = 0,55 N/mm² · %s mm² · 0,88 = %s N ≈ 350 N' % (de(a2), de(a2), de(f2)))])), 'Beispiel 2', anker='b2')
    b += wrap('B3', 'Spannstock mit Kipphebel',
              '<p>Ein Werkstück wird zum Überfräsen in einen Spannstock eingespannt. Ein mit pe = 6 bar beaufschlagter Kolben betätigt einen Kipphebel, der auf der kürzeren Hebelseite die bewegliche Spannbacke gegen das Werkstück drückt.</p>'
              '<p>Wie groß ist die Spannkraft F2, wenn der Wirkungsgrad 88 % beträgt?</p>' +
              fig('spannstock-kipphebel.jpg', 'Spannstock im Schnitt: Kolben mit 140 mm Durchmesser, Hebelarm 150 mm von der Kolbenachse zum Drehpunkt und 50 mm vom Drehpunkt zur Spannkraft F2, Druck 6 bar',
                  'Spannstock: Kolben ø140 mm, Hebelarme 150 mm und 50 mm', 'hell', breite=420, w=556, h=389) +
              loesung(zeilen([('Gegeben', 'D = 140 mm, pe = 6 bar = 0,6 N/mm², η = 0,88; Hebelarme laut Bild: l<sub>1</sub> = 150 mm (Kolbenachse bis Drehpunkt), l<sub>2</sub> = 50 mm (Drehpunkt bis F<sub>2</sub>)'),
                              ('Fläche', 'A = π/4 · (140 mm)² = %s mm²' % de(a3, 0)),
                              ('Kolbenkraft', 'F<sub>1</sub> = pe · A · η = 0,6 N/mm² · %s mm² · 0,88 = %s N' % (de(a3, 0), de(f3a, 0))),
                              ('Hebel', 'F<sub>1</sub> · l<sub>1</sub> = F<sub>2</sub> · l<sub>2</sub> → F<sub>2</sub> = F<sub>1</sub> · l<sub>1</sub> / l<sub>2</sub> = %s N · 150 / 50' % de(f3a, 0)),
                              ('Ergebnis', 'F<sub>2</sub> = %s N ≈ %s kN' % (de(f3b, 0), de(f3b / 1000)), 'erg'),
                              ('Hinweis', 'Der Wirkungsgrad gilt für die ganze Anordnung und wird einmal berücksichtigt.')])), 'Beispiel 3', anker='b3')
    b += wrap('B4', 'Zangengreifer',
              '<p>Die Zylindereinheit eines pneumatischen Zangengreifers wird mit pe = 4,5 bar beaufschlagt. Für die Kolbenkraft in der Stange ist F = 120 N nötig, wenn sich die Zange schließt. Der Zylinderdurchmesser D beträgt 25 mm.</p>'
              '<p>Wie groß muss der Stangendurchmesser d in mm bei einem Wirkungsgrad von 92 % werden?</p>' +
              fig('zangengreifer.jpg', 'Pneumatischer Zangengreifer: Zylindereinheit mit Kolbenstange, die über Gelenke die Zangenbacken schließt; Kraft F gleich 120 N, Druck 4,5 bar',
                  'Zangengreifer: F = 120 N, pe = 4,5 bar', 'hell', breite=420, w=556, h=321) +
              loesung('<p>Beim Schließen der Zange fährt der Kolben ein: Der Druck wirkt auf die <strong>Ringfläche</strong>.</p>' +
                      zeilen([('Gegeben', 'pe = 4,5 bar = 0,45 N/mm², F = 120 N, D = 25 mm, η = 0,92'),
                              ('Ringfläche', 'A = F / (pe · η) = 120 N / (0,45 N/mm² · 0,92) = %s mm²' % de(a4r)),
                              ('Kolbenfläche', 'A<sub>K</sub> = π/4 · (25 mm)² = %s mm²' % de(a4k)),
                              ('Stangenfläche', 'A<sub>S</sub> = A<sub>K</sub> − A = %s mm² − %s mm² = %s mm²' % (de(a4k), de(a4r), de(a4s))),
                              ('Ergebnis', 'd = √(4 · A<sub>S</sub> / π) = %s mm ≈ 16 mm' % de(d4), 'erg')])), 'Beispiel 4', anker='b4')

    # ── Übungen ──
    kopf = '<tr><th>Zylinder</th><th>D</th><th>pe</th><th>A</th><th>F<sub>th</sub></th><th>F (η = 0,85)</th></tr>'
    zl = ''.join('<tr%s><td><strong>%s</strong></td><td>%d mm</td><td>%d bar</td><td>%s mm²</td><td>%s N</td><td><strong>%s N</strong></td></tr>'
                 % ('', n, D, pe, de(A_), de(Fth), de(F_)) for n, D, pe, A_, Fth, F_ in u1)
    b += wrap('Ü1', 'Kolbenkräfte einfach wirkender Zylinder',
              '<p>Wie groß sind die Kolbenkräfte für die einfach wirkenden Pneumatikzylinder a bis c? Der Wirkungsgrad der Zylinder beträgt jeweils 85 %.</p>'
              '<div class="tbl-wrap"><table><tr><th>Zylinder</th><th>D in mm</th><th>pe in bar</th></tr><tr><td><strong>a</strong></td><td>80</td><td>6</td></tr>'
              '<tr><td><strong>b</strong></td><td>63</td><td>8</td></tr><tr><td><strong>c</strong></td><td>50</td><td>4</td></tr></table></div>' +
              loesung('<p>Je Zylinder: A = π/4 · D², F<sub>th</sub> = pe · A, F = F<sub>th</sub> · η.</p><div class="tbl-wrap"><table>%s%s</table></div>' % (kopf, zl)), 'Übung 1', anker='u1')
    b += wrap('Ü2', 'Kolbenstangenrückführung',
              '<p>Nach dem Ausfahren des doppelt wirkenden Zylinders wird das 3/2-Wegeventil wieder losgelassen.</p>'
              '<p>Mit welcher Kraft fährt der Zylinderkolben mit D = 25 mm und Stangendurchmesser d = 10 mm in seine Endlage zurück, wenn das Druckregelventil für einen konstanten Rückstelldruck sorgt und der Wirkungsgrad 90 % beträgt?</p>' +
              fig('kolbenstangenrueckfuehrung.jpg', 'Schaltplan: doppelt wirkender Zylinder, 3/2-Wegeventil mit 6 bar Versorgungsdruck und Druckregelventil mit Entlastungsöffnung, am Zylinder liegen 0,5 bar an',
                  'Schaltplan: Versorgung pe = 6 bar, Rückstelldruck pe = 0,5 bar', 'hell', breite=380, w=720, h=623) +
              loesung(zeilen([('Gegeben', 'D = 25 mm, d = 10 mm, η = 0,9, Rückstelldruck pe = 0,5 bar = 0,05 N/mm² (laut Bild)'),
                              ('Ringfläche', 'A = π/4 · (D² − d²) = π/4 · (25² − 10²) mm² = %s mm²' % de(a_u2)),
                              ('Ergebnis', 'F = pe · A · η = 0,05 N/mm² · %s mm² · 0,9 ≈ %s N' % (de(a_u2), de(f_u2)), 'erg')])), 'Übung 2', anker='u2')
    b += wrap('Ü3', 'Konstante Kraft an Pneumatikzylindern',
              '<p>Ein doppelt wirkender Zylinder hat die Maße 63 x 20 x 125 und einen Wirkungsgrad von 85 %. Er soll im Vorhub als auch im Rückhub die gleiche Kraft F = 1480 N aufbringen.</p>'
              '<p>Auf welchen Druck müssen die Regelventile eingestellt werden, damit die gleiche Kraft erzielt werden kann?</p>' +
              fig('druckregelventil.jpg', 'Druckregelventil im Schnitt mit Eingangsdruck pe1 und Ausgangsdruck pe2 sowie das zugehörige Schaltzeichen',
                  'Druckregelventil: Eingangsdruck p<sub>e1</sub>, Ausgangsdruck p<sub>e2</sub>', 'hell', breite=380, w=831, h=643) +
              loesung('<p>Maße üblicherweise: Kolben ø63 mm, Kolbenstange ø20 mm, Hub 125 mm. Im Vorhub wirkt der Druck auf die volle Kolbenfläche, im Rückhub nur auf die Ringfläche, '
                      'also braucht der Rückhub einen höheren Druck.</p>' +
                      zeilen([('Gegeben', 'F = 1480 N, η = 0,85'),
                              ('Vorhub', 'A = π/4 · 63² = %s mm² → pe = F / (A · η) = 1480 N / (%s mm² · 0,85) = %s N/mm² = %s bar' % (de(a_v), de(a_v), de(p_v, 4), de(p_v * 10, 2)), 'erg'),
                              ('Rückhub', 'A = π/4 · (63² − 20²) = %s mm² → pe = 1480 N / (%s mm² · 0,85) = %s N/mm² = %s bar' % (de(a_r), de(a_r), de(p_r, 4), de(p_r * 10, 2)), 'erg')])), 'Übung 3', anker='u3')
    b += wrap('Ü4', 'Pneumatisch Spannen',
              '<p>Für die pneumatische Spannvorrichtung sollen bei einem Wirkungsgrad von 0,87 folgende Werte berechnet werden:</p>'
              '<ul><li>a) Die wirksame Kolbenkraft F1, bei einem Kolbendurchmesser von 32 mm.</li>'
              '<li>b) Die wirksame Spannkraft F2, wenn das Übersetzungsverhältnis des Hebels i = l1 : l2 = 2,8 : 1 beträgt.</li></ul>' +
              fig('pneumatisch-spannen.jpg', 'Pneumatische Spannvorrichtung: Zylinder mit 5 bar drückt mit der Kraft F1 auf den Hebel mit den Armen l1 und l2, am kurzen Arm entsteht die Spannkraft F2',
                  'Spannvorrichtung: pe = 5,0 bar, Hebelarme l<sub>1</sub> und l<sub>2</sub>', 'hell', breite=420, w=745, h=566) +
              loesung(zeilen([('Gegeben', 'D = 32 mm, pe = 5,0 bar = 0,5 N/mm² (laut Bild), η = 0,87, i = 2,8'),
                              ('a)', 'A = π/4 · (32 mm)² = %s mm² → F<sub>1</sub> = pe · A · η = 0,5 N/mm² · %s mm² · 0,87 = %s N ≈ %s N' % (de(a_u4), de(a_u4), de(f_u4a), de(f_u4a, 0)), 'erg'),
                              ('b)', 'F<sub>2</sub> = F<sub>1</sub> · i = %s N · 2,8 = %s N ≈ %s N' % (de(f_u4a), de(f_u4b), de(f_u4b, 0)), 'erg')])), 'Übung 4', anker='u4')

    kurz = [('Druck', 'p = F / A'), ('Theoretische Kolbenkraft', 'F<sub>th</sub> = pe · A'), ('Wirksame Kolbenkraft', 'F = pe · A · η'),
            ('Kolbenfläche', 'A = π/4 · D²'), ('Ringfläche (Einfahren)', 'A = π/4 · (D² − d²)'), ('Hebel', 'F<sub>1</sub> · l<sub>1</sub> = F<sub>2</sub> · l<sub>2</sub>'),
            ('Umrechnung', '1 bar = 10 N/cm² = 0,1 N/mm² = 100 kPa = 100 000 Pa')]
    b += wrap('', 'Kurz gemerkt', '<div class="tbl-wrap"><table>%s</table></div>' % ''.join('<tr><td><strong>%s</strong></td><td>%s</td></tr>' % kv for kv in kurz), anker='merker')
    jump = [('s1', '1'), ('s2', '2'), ('s3', '3'), ('s4', '4'), ('b1', 'B1'), ('b2', 'B2'), ('b3', 'B3'), ('b4', 'B4'), ('u1', 'Ü1'), ('u2', 'Ü2'), ('u3', 'Ü3'), ('u4', 'Ü4'), ('merker', 'Merker')]
    seite('faecher/mathematik/pneumatik-grundlagen.html', 'am', 'AM3 — Pneumatik: Grundlagen', '🔧 3Mb · Pneumatik',
          'Druck · Kolbenkraft · Wirkungsgrad · Beispiele und Übungen mit Lösungsvorschlägen', 'p = F / A', 
          '<div class="notice-box"><strong>Hinweis:</strong> Die Beispiele und Übungen stammen aus dem Arbeitsblatt „Pneumatik“ (AM3). '
          'Die Lösungen sind eigene Lösungsvorschläge, bei Abweichungen gilt die Lösung aus dem Unterricht.</div>\n' + b, jump, 'Abschnitt',
          extra_nav='<button class="btn" id="sol-toggle" type="button">Alle Lösungen zeigen</button>', extra_css=FIG_CSS)


# ───────────────────────── Lernzielkontrollen (3Mb): Zusammenfassung, typische Fehler, Beispielaufgaben ─────────────────────────
# Je Fach eine Seite, je Kontrolle ein Eintrag (neueste zuerst). Neue Woche = neuen Eintrag oben in LZK_AM bzw. LZK_AEE ergänzen.
def lzk_body(e):
    """Abschnitte einer Lernzielkontrolle: Lernziele, Zusammenfassung, typische Fehler, Beispielaufgaben (mit aufklappbarer Lösung)"""
    k, note = e['id'], e['kurz_datum']
    b = wrap('1', 'Das solltest du können', '<ul class="ziele">%s</ul>' % ''.join('<li>%s</li>' % z for z in e['ziele']), note, anker=k + '-ziele')
    b += wrap('2', 'Zusammenfassung', '<div class="tbl-wrap"><table>%s</table></div>%s' % (
        ''.join('<tr><td><strong>%s</strong></td><td>%s</td></tr>' % kv for kv in e['kurz']), e.get('mehr', '')), note, anker=k + '-kurz')
    b += wrap('3', 'Typische Fehler', '<ul>%s</ul>' % ''.join('<li>%s</li>' % f for f in e['fehler']), note, anker=k + '-fehler')
    jump = [(k + '-ziele', 'Lernziele'), (k + '-kurz', 'Zusammenfassung'), (k + '-fehler', 'Fehler')]
    for n, (titel, text, lsg) in enumerate(e['aufgaben'], 1):
        b += wrap('A%d' % n, titel, text + loesung(lsg), 'Beispielaufgabe', anker='%s-a%d' % (k, n)); jump.append(('%s-a%d' % (k, n), 'A%d' % n))
    return b, jump

def lzk_am():
    kreis = lambda D: math.pi / 4 * D * D
    ring = lambda D, d: math.pi / 4 * (D * D - d * d)
    PA = lambda bar: bar / 10
    # A3 Kolbenkraft einfach wirkend, A4 Aus- und Einfahren, A5 Durchmesser gesucht, A6 Spannvorrichtung mit Hebel
    a3 = kreis(40); f3th = PA(6) * a3; f3 = f3th * .9
    a4k = kreis(50); a4r = ring(50, 20); f4a = PA(5) * a4k * .92; f4e = PA(5) * a4r * .92
    a5 = 500 / (PA(6) * .85); d5 = math.sqrt(4 * a5 / math.pi)
    a6 = kreis(63); f6a = PA(5) * a6 * .85; f6b = f6a * 3
    print('Kontrollwerte LZK-AM  A3 F=%.2f  A4 %.2f/%.2f  A5 A=%.2f D=%.2f  A6 F1=%.2f F2=%.2f' % (f3, f4a, f4e, a5, d5, f6a, f6b))
    sub = lambda t, i: '%s<sub>%s</sub>' % (t, i)
    eintrag = dict(
        id='k1', kurz_datum='Mi 25.11.2026',
        ziele=['Die Größen der Pneumatik mit Formelzeichen und Einheit nennen (p, F, A, V, T, Q, s, v)',
               'Den Druck mit p = F / A berechnen und zwischen Pa, kPa, MPa und bar umrechnen',
               'Die theoretische und die wirksame Kolbenkraft berechnen: %s = pe · A und F = pe · A · η' % sub('F', 'th'),
               'Kolbenfläche und Ringfläche unterscheiden: Ausfahren mit A = π/4 · D², Einfahren mit A = π/4 · (D² − d²)',
               'Rückwärts rechnen: Durchmesser oder Druck aus einer vorgegebenen Kraft bestimmen',
               'Bei der Spannvorrichtung den Hebel einbeziehen: %s = %s · %s / %s' % (sub('F', '2'), sub('F', '1'), sub('l', '1'), sub('l', '2')),
               'Vor- und Nachteile der Pneumatik nennen'],
        kurz=[('Pneumatik', 'Erzeugung, Aufbereitung, Steuerung und Nutzung von Druckluft; sie erzeugt Bewegungen und Kräfte (spannen, transportieren, Werkzeuge antreiben)'),
              ('Vorteile', 'Druckluft einfach verfügbar · hohe Arbeitsgeschwindigkeiten · robust · einfache Steuerung und Automatisierung · keine elektrische Energie am Antrieb'),
              ('Nachteile', 'teuer in der Erzeugung · Luft ist kompressibel · Bewegungen schwer exakt zu positionieren · Geräusch durch ausströmende Luft · Kraft im Vergleich zur Hydraulik begrenzt'),
              ('Druck', 'p = F / A &nbsp;·&nbsp; 1 bar = 100 000 Pa = 100 kPa = 0,1 MPa = 10 N/cm² = 0,1 N/mm²'),
              ('Kolbenkraft', '%s = pe · A (theoretisch) &nbsp;·&nbsp; F = pe · A · η (wirksam; η berücksichtigt die Reibungsverluste)' % sub('F', 'th')),
              ('Flächen', 'Ausfahren: A = π/4 · D² &nbsp;·&nbsp; Einfahren (doppelt wirkend): A = π/4 · (D² − d²)'),
              ('Hebel', '%s · %s = %s · %s' % (sub('F', '1'), sub('l', '1'), sub('F', '2'), sub('l', '2'))),
              ('Rechenweg', '① Druck in N/mm² (bar ÷ 10), Längen in mm &nbsp;② passende Fläche &nbsp;③ %s = pe · A &nbsp;④ mal η' % sub('F', 'th'))],
        mehr='<div class="info-box"><strong>Ausführlich:</strong> <a href="pneumatik-grundlagen.html">AM3 — Pneumatik: Grundlagen</a> mit allen Beispielen und Übungen des Arbeitsblatts.</div>',
        fehler=['bar nicht in N/mm² umgerechnet: Das Ergebnis ist um den Faktor 10 zu groß',
                'Durchmesser statt Fläche eingesetzt (A = π/4 · D² vergessen)',
                'Beim Einfahren die volle Kolbenfläche statt der Ringfläche genommen',
                'Wirkungsgrad vergessen oder als 92 statt 0,92 eingesetzt',
                'mm² und cm² oder Radius und Durchmesser verwechselt',
                'Zwischenergebnisse zu früh gerundet'],
        aufgaben=[
            ('Umrechnen', '<p>Rechne um: a) 6,3 bar in Pa und in kPa · b) 250 kPa in bar · c) 0,8 MPa in bar</p>',
             zeilen([('a)', '6,3 bar = 6,3 · 100 000 Pa = 630 000 Pa = 630 kPa'), ('b)', '250 kPa = 250 / 100 bar = 2,5 bar'), ('c)', '0,8 MPa = 0,8 · 10 bar = 8 bar', 'erg')])),
            ('Druck aus Kraft und Fläche', '<p>Auf einen Kolben mit der Fläche 12 cm² wirkt die Kraft 900 N. Wie groß ist der Druck in bar?</p>',
             zeilen([('Formel', 'p = F / A'), ('Rechnung', 'p = 900 N / 12 cm² = 75 N/cm²'), ('Ergebnis', '1 bar = 10 N/cm² → p = 7,5 bar', 'erg')])),
            ('Kolbenkraft eines einfach wirkenden Zylinders',
             '<p>Ein einfach wirkender Zylinder mit Kolbendurchmesser 40 mm wird mit einem Überdruck von 6 bar beaufschlagt. Der Wirkungsgrad beträgt 90 %. Wie groß ist die wirksame Kolbenkraft?</p>',
             zeilen([('Fläche', 'A = π/4 · (40 mm)² = %s mm²' % de(a3)), ('Theoretisch', '%s = pe · A = 0,6 N/mm² · %s mm² = %s N' % (sub('F', 'th'), de(a3), de(f3th))),
                     ('Ergebnis', 'F = %s N · 0,9 ≈ %s N' % (de(f3th), de(f3, 0)), 'erg')])),
            ('Ausfahren und Einfahren',
             '<p>Ein doppelt wirkender Zylinder hat den Kolbendurchmesser D = 50 mm und den Kolbenstangendurchmesser d = 20 mm. Der Überdruck beträgt 5 bar, der Wirkungsgrad 0,92. Berechne die Kraft a) beim Ausfahren und b) beim Einfahren.</p>',
             zeilen([('a) Ausfahren', 'A = π/4 · 50² = %s mm² → F = 0,5 N/mm² · %s mm² · 0,92 ≈ %s N' % (de(a4k), de(a4k), de(f4a, 0)), 'erg'),
                     ('b) Einfahren', 'Ringfläche A = π/4 · (50² − 20²) = %s mm² → F = 0,5 N/mm² · %s mm² · 0,92 ≈ %s N' % (de(a4r), de(a4r), de(f4e, 0)), 'erg'),
                     ('Hinweis', 'Beim Einfahren ist die Kraft kleiner, weil die Kolbenstange Fläche wegnimmt.')])),
            ('Kolbendurchmesser gesucht',
             '<p>Ein einfach wirkender Zylinder soll mit einem Überdruck von 6 bar bei einem Wirkungsgrad von 0,85 eine Kraft von 500 N aufbringen. Welchen Kolbendurchmesser braucht er mindestens?</p>',
             zeilen([('Fläche', 'A = F / (pe · η) = 500 N / (0,6 N/mm² · 0,85) = %s mm²' % de(a5)), ('Durchmesser', 'D = √(4A / π) = √(4 · %s mm² / π)' % de(a5)),
                     ('Ergebnis', 'D ≈ %s mm. In der Praxis wählt man den nächstgrößeren Normdurchmesser, hier 40 mm.' % de(d5), 'erg')])),
            ('Spannvorrichtung mit Hebel',
             '<p>Eine pneumatische Spannvorrichtung hat einen Kolben mit D = 63 mm und wird mit pe = 5,0 bar beaufschlagt. Der Wirkungsgrad beträgt 0,85, das Hebelverhältnis l1 : l2 = 3 : 1. Berechne die Kolbenkraft F1 und die Spannkraft F2.</p>' +
             fig('pneumatisch-spannen.jpg', 'Pneumatische Spannvorrichtung: Zylinder drückt mit F1 auf den Hebel mit den Armen l1 und l2, am kurzen Arm entsteht die Spannkraft F2', 'Spannvorrichtung (Bild aus dem Arbeitsblatt)', 'hell', breite=380, w=745, h=566),
             zeilen([('Fläche', 'A = π/4 · (63 mm)² = %s mm²' % de(a6)), ('Kolbenkraft', '%s = pe · A · η = 0,5 N/mm² · %s mm² · 0,85 = %s N' % (sub('F', '1'), de(a6), de(f6a, 0))),
                     ('Ergebnis', '%s = %s · %s / %s = %s N · 3 ≈ %s N' % (sub('F', '2'), sub('F', '1'), sub('l', '1'), sub('l', '2'), de(f6a, 0), de(f6b, 0)), 'erg')])),
            ('Verständnisfragen', '<p>a) Nenne zwei Vorteile und zwei Nachteile der Pneumatik. b) Warum ist die wirksame Kolbenkraft kleiner als die theoretische?</p>',
             '<ul><li><strong>a)</strong> Vorteile zum Beispiel: Druckluft ist einfach verfügbar, hohe Arbeitsgeschwindigkeiten, robust, einfache Steuerung. Nachteile zum Beispiel: teuer in der Erzeugung, Luft ist kompressibel (exaktes Positionieren schwierig), Geräusch, begrenzte Kraft.</li>'
             '<li><strong>b)</strong> Zwischen Kolben, Kolbenstange, Dichtungen und Zylinderwand entstehen Reibungsverluste. Sie werden durch den Wirkungsgrad η (kleiner als 1) berücksichtigt: F = %s · η.</li></ul>' % sub('F', 'th')),
        ])
    body, jump = lzk_body(eintrag)
    kopf = ('<div class="notice-box"><strong>Hinweis:</strong> Zusammenstellung aus den Unterlagen der letzten Einheiten (bis 19.11.2026), damit du dich auf die wöchentliche Lernzielkontrolle '
            'am Mittwoch vorbereiten kannst. Was genau abgefragt wird, entscheidet die Lehrkraft. Die Aufgaben sind Übungsbeispiele in der Art des Arbeitsblatts, die Lösungen eigene Lösungsvorschläge.</div>\n')
    seite('faecher/mathematik/lzk-am3.html', 'am', 'AM3 — Lernzielkontrolle (Mittwoch)', '📝 Wöchentlich am Mittwoch · aktuell: Pneumatik',
          'Lernziele · Zusammenfassung · typische Fehler · Beispielaufgaben mit Lösungen', 'LZK', kopf + body, jump, 'Springe zu',
          extra_nav='<button class="btn" id="sol-toggle" type="button">Alle Lösungen zeigen</button>', extra_css=FIG_CSS)

def lzk_aee():
    sub = lambda t, i: '%s<sub>%s</sub>' % (t, i)
    U = 325; al = 210
    u1 = U * math.sin(math.radians(al)); u2 = U * math.sin(math.radians(al - 120)); u3 = U * math.sin(math.radians(al - 240))
    print('Kontrollwerte LZK-AEE  u1=%.2f u2=%.2f u3=%.2f Summe=%.6f' % (u1, u2, u3, u1 + u2 + u3))
    eintrag = dict(
        id='k1', kurz_datum='Do 26.11.2026',
        ziele=['Erklären, wie eine Dreiphasenwechselspannung entsteht (Polrad im Ständer mit drei um 120° versetzten Spulen, Induktion)',
               'Die Eigenschaften der drei Strangspannungen nennen',
               'Die Spannungsgleichungen aufstellen: u₁ = Û · sin α, u₂ = Û · sin(α − 120°), u₃ = Û · sin(α − 240°)',
               'Liniendiagramm und Zeigerbild der drei Spannungen zeichnen und lesen',
               'Momentanwerte berechnen und zeigen, dass ihre Summe 0 ist',
               'Sternschaltung und Dreieckschaltung unterscheiden und beschreiben, wie die Spulen verkettet werden',
               'Die Vorteile des Drehstroms nennen'],
        kurz=[('Erzeugung', 'Synchrongenerator: Das Polrad (Nord- und Südpol) dreht sich im Ständer mit drei Spulen und induziert in jeder eine Wechselspannung. Mit Wechselrichtern entsteht Drehstrom auch aus Gleichstrom (Photovoltaik, Batterien).'),
              ('Phasenverschiebung', 'Spulen räumlich um 120° versetzt → Spannungen zeitlich um ⅓ Periode = 120° versetzt'),
              ('Eigenschaften', 'gleich groß · gleiche Frequenz · gegeneinander um 120° verschoben · vollkommen gleichwertig · Summe zu jedem Zeitpunkt 0'),
              ('Gleichungen', 'u₁ = Û · sin α &nbsp;·&nbsp; u₂ = Û · sin(α − 120°) &nbsp;·&nbsp; u₃ = Û · sin(α − 240°)'),
              ('Zeigerbild', 'drei gleich lange Zeiger im Abstand von 120°; aneinandergelegt schließen sie sich zu einem Dreieck (Summe 0)'),
              ('Verkettung', '<strong>Stern:</strong> die Enden U2, V2, W2 im Sternpunkt, die Anfänge U1, V1, W1 an L1, L2, L3 &nbsp;·&nbsp; <strong>Dreieck:</strong> Ende einer Spule an den Anfang der nächsten (U2–V1, V2–W1, W2–U1), an den Ecken L1, L2, L3'),
              ('Drehstrom', 'ist ein verketteter Dreiphasenwechselstrom'),
              ('Vorteile', 'kleinere Generatoren und Transformatoren · 50 % Leitungsmaterial sparen · günstige Drehstrommotoren · zwei Spannungen für einphasige und dreiphasige Verbraucher')],
        mehr='<div class="info-box"><strong>Ausführlich:</strong> <a href="drehstrom-einheit-1.html">AEE3 — Einheit 1: Drehstrom</a> und das Arbeitsblatt <a href="dreiphasenwechselspannung.html">Dreiphasenwechselspannung</a>.</div>',
        fehler=['Taschenrechner im RAD- statt im DEG-Modus',
                'Klammer vergessen: sin(α − 120°) ist nicht sin α − 120°',
                'Verschiebung verwechselt: u₂ eilt um 120° nach, u₃ um 240° (das entspricht 120° voraus)',
                'Stern- und Dreieckschaltung vertauscht: beim Stern kommen alle Enden zusammen, beim Dreieck geht jedes Ende an den Anfang der nächsten Spule',
                'Summe der Momentanwerte nicht 0, weil zu früh gerundet wurde: mit genauen Werten rechnen (zum Beispiel sin 30° = 0,5)',
                'Im Zeigerbild die Zeiger verschieden lang gezeichnet oder nicht 120° auseinander'],
        aufgaben=[
            ('Entstehung erklären', '<p>Beschreibe in wenigen Sätzen, wie in einem Generator eine Dreiphasenwechselspannung entsteht.</p>',
             '<ul><li>Im <strong>Ständer</strong> sitzen drei Spulen (U1–U2, V1–V2, W1–W2), räumlich um <strong>120°</strong> versetzt.</li>'
             '<li>Das <strong>Polrad</strong> (Magnet mit Nord- und Südpol) wird angetrieben und dreht sich im Ständer.</li>'
             '<li>Das umlaufende Magnetfeld induziert in jeder Spule eine Wechselspannung.</li>'
             '<li>Weil die Spulen versetzt sind, erreichen die Spannungen ihren Höchstwert nacheinander: Sie sind um 120° (⅓ Periode) gegeneinander verschoben.</li></ul>'),
            ('Eigenschaften nennen', '<p>Nenne vier Eigenschaften der drei Strangspannungen eines Drehstromsystems.</p>',
             '<ul><li>gleich groß (gleicher Scheitelwert)</li><li>gleiche Frequenz</li><li>gegeneinander um 120° (⅓ Periode) phasenverschoben</li><li>die Summe der Augenblickswerte ist zu jedem Zeitpunkt 0 V</li><li>(außerdem: vollkommen gleichwertig)</li></ul>'),
            ('Momentanwerte bei α = 210°', '<p>Gegeben ist Û = 325 V. Gib die Spannungsgleichungen für u₁, u₂ und u₃ an. Berechne die Momentanwerte bei α = 210° und ihre Summe.</p>',
             '<div class="formula-box">u₁ = Û · sin α<br>u₂ = Û · sin(α − 120°)<br>u₃ = Û · sin(α − 240°)</div>' +
             zeilen([('u₁', 'u₁ = 325 V · sin 210° = 325 V · (−0,5) = %s V' % de(u1)),
                     ('u₂', 'u₂ = 325 V · sin(210° − 120°) = 325 V · sin 90° = %s V' % de(u2)),
                     ('u₃', 'u₃ = 325 V · sin(210° − 240°) = 325 V · sin(−30°) = %s V' % de(u3)),
                     ('Summe', 'u₁ + u₂ + u₃ = %s V + %s V − %s V = 0 V' % (de(u1).replace('−', '−'), de(u2), de(-u3)), 'erg')])),
            ('Liniendiagramm und Zeigerbild', '<p>Zeichne die drei Spannungen mit Û = 325 V als Liniendiagramm (0° bis 360°) und als Zeigerbild.</p>',
             '<div class="fig-row">' + fig_svg(diagramm_linien('k1-a4-l'), 'Liniendiagramm: u₂ ist um 120° nach rechts verschoben, u₃ um 240°', breit=True) +
             fig_svg(diagramm_zeiger('k1-a4-z'), 'Zeigerbild: drei gleich lange Zeiger, jeweils 120° auseinander') + '</div>'),
            ('Verkettungsarten erkennen', '<p>Welche Verkettungsart zeigen die beiden Schaltbilder? Beschreibe, wie die Spulen jeweils verbunden sind.</p><div class="fig-row">' +
             fig('sternschaltung.png', 'Schaltbild 1: Spulenanfänge U1, V1, W1 an L1, L2, L3, Spulenenden U2, V2, W2 in einem Punkt verbunden', 'Schaltbild 1', 'hell', breite=250, w=715, h=671) +
             fig('dreieckschaltung.png', 'Schaltbild 2: Die drei Spulen bilden ein Dreieck, an den Ecken liegen L1, L2, L3', 'Schaltbild 2', 'hell', breite=250, w=857, h=714) + '</div>',
             '<ul><li><strong>Schaltbild 1 = Sternschaltung:</strong> Die Enden U2, V2, W2 sind im Sternpunkt verbunden, die Anfänge U1, V1, W1 liegen an L1, L2, L3.</li>'
             '<li><strong>Schaltbild 2 = Dreieckschaltung:</strong> Das Ende jeder Spule ist mit dem Anfang der nächsten verbunden (U2–V1, V2–W1, W2–U1), an den drei Ecken liegen L1, L2, L3.</li></ul>'),
            ('Vorteile des Drehstroms', '<p>Nenne vier Vorteile des Drehstroms.</p>',
             '<ul><li>Generatoren und Transformatoren sind kleiner als Wechselstromgeräte gleicher Leistung.</li><li>Bei der Übertragung großer Leistungen spart man 50 % Leitungsmaterial.</li>'
             '<li>Drehstrommotoren lassen sich besonders günstig herstellen.</li><li>Im Drehstromnetz stehen zwei Spannungen zur Verfügung: einphasige und dreiphasige Verbraucher können angeschlossen werden.</li></ul>'),
        ])
    body, jump = lzk_body(eintrag)
    kopf = ('<div class="notice-box"><strong>Hinweis:</strong> Zusammenstellung aus den Unterlagen der letzten Einheiten (bis 19.11.2026), damit du dich auf die wöchentliche Lernzielkontrolle '
            'am Donnerstag vorbereiten kannst. Was genau abgefragt wird, entscheidet die Lehrkraft. Die Aufgaben sind Übungsbeispiele in der Art des Arbeitsblatts, die Lösungen eigene Lösungsvorschläge.</div>\n')
    seite('faecher/aee/lzk-aee3.html', 'aee', 'AEE3 — Lernzielkontrolle (Donnerstag)', '📝 Wöchentlich am Donnerstag · aktuell: Drehstrom',
          'Lernziele · Zusammenfassung · typische Fehler · Beispielaufgaben mit Lösungen', 'LZK', kopf + body, jump, 'Springe zu',
          extra_nav='<button class="btn" id="sol-toggle" type="button">Alle Lösungen zeigen</button>', extra_css=AEE3_CSS)

if __name__ == '__main__':
    import sys
    todo = sys.argv[1:] or ['met', 'aee', 'mathe', 'aee3', 'pneu', 'lzk']
    if 'met' in todo: met()
    if 'aee' in todo: aee()
    if 'mathe' in todo: print('Punktesumme Mathe:', mathe())
    if 'aee3' in todo: aee3()
    if 'pneu' in todo: pneu()
    if 'lzk' in todo: lzk_am(); lzk_aee()
