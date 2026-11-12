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

def seite(pfad, farbe, titel, badge, motto, deco, body, jump=(), jump_label='Abschnitt', mathjax=False, extra_nav=''):
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
<style>{css}</style>
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

if __name__ == '__main__':
    met(); aee(); print('Punktesumme Mathe:', mathe())
