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

AEE3_CSS = """
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
/* eigene Diagramme (SVG) */
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
              loesung('<div class="tbl-wrap"><table>%s</table></div>' % tab +
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

if __name__ == '__main__':
    import sys
    todo = sys.argv[1:] or ['met', 'aee', 'mathe', 'aee3']
    if 'met' in todo: met()
    if 'aee' in todo: aee()
    if 'mathe' in todo: print('Punktesumme Mathe:', mathe())
    if 'aee3' in todo: aee3()
