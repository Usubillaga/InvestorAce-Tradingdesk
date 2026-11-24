"""Rebuild the three historical comparison pages from their published daily-close event export."""
import csv
from html import escape
from pathlib import Path
from statistics import mean

DIST = Path(__file__).resolve().parents[3] / 'dist'
SOURCE = 'https://github.com/Usubillaga/InvestorAce/blob/36d35ba5b180f01e93946d42b5ee13a2bc5c5660/backtests/panic_history.md'
RSP = 'https://www.invesco.com/us/en/financial-products/etfs/invesco-sp-500-equal-weight-etf.html'
FILES = {'es':'heat-comparison.html','en':'heat-comparison.en.html','de':'heat-comparison.de.html'}

COPY = {
'es': dict(
 title='Pánico bajo 20 o bajo 17', back='Pánico y euforia', stamp='Estudio histórico en USD · Cierre del 23.11.2026',
 intro='Comprar al siguiente cierre después del pánico, mantener al menos 42 meses naturales y vender al cierre siguiente a la primera lectura de euforia de 80 o más. El único cambio entre las dos reglas históricas es el umbral de compra.',
 rsp='La cesta propuesta con RSP', rsp_note='Rentabilidad media por venta de la cesta formada por un 50 % en el Top 10 estimado y un 50 % en RSP. Las dos reglas se comparan sobre las mismas nueve fases cerradas con precios del ETF.',
 buy='Compra bajo', delta='Diferencia en las fases comunes', points='puntos porcentuales', 
 samples='Qué cambia al incluir las crisis de 2001 y 2002', sample_note='Con el umbral 20, la primera tabla cubre las 13 ventas completas. La segunda utiliza únicamente las nueve fases completas en las que RSP ya cotizaba. La columna de victorias compara cada cesta con el S&P 500 de precios en sus propias fechas.',
 all='Todas las ventas completas', matched='Las mismas nueve fases con RSP', basket='Cesta', n='Ventas', avg='Media', worst='Peor retorno final', dd='Peor drawdown', wins='Supera al S&P',
 top='Top 10 estimado', equal='Miembros equiponderados al inicio', mix='½ Top 10 + ½ equiponderada inicial', fund='½ Top 10 + ½ RSP',
 early='El −9,2 % y el +2,3 % del Top 10 corresponden a marzo y septiembre de 2001. El retorno equiponderado fue +48,7 % y +54,4 %, respectivamente. Antes de 2010 faltan cotizaciones de empresas excluidas o quebradas. Su ausencia puede favorecer a la equiponderada y a su mezcla.',
 pr='El PR #230 registra 14 observaciones, incluidas 13 ventas y la valoración abierta de abril de 2025. En sus fechas (mínimo 882 sesiones), el Top 10 superó al índice en 10/14 y la mixta histórica en 14/14. RSP empezó a cotizar el 24.04.2003.',
 grid='¿Destaca el 17 entre los once umbrales?', risk='Medias de ventas completas para la mezcla histórica equiponderada al inicio. Los episodios se vuelven a identificar en cada nivel y pueden solaparse en el tiempo.',
 threshold='Umbral', signals='Señales', open='Abiertas', details='Compras por fase · cesta con RSP', phase='Pánico base', entry='Compra', end='Salida o marca', ret='Retorno', mark='abierta', missing='Sin cotización de RSP',
 check='La ventaja del 17 para la mezcla histórica es de 4,0 puntos en 13 ventas. Al omitir una fase cada vez varía de 2,5 a 5,0 puntos. Se compararon once niveles sobre la misma historia.',
 forward='Comparación prospectiva propuesta', rules='Las dos cuentas de papel propuestas dedicarían la mitad al Top 10 del S&P 500, proporcional a su peso, y la otra mitad a RSP. Una exigiría pánico inferior a 20 y la otra inferior a 17, confirmado antes del cierre. Se aplicaría la misma espera de 42 meses y la misma salida por euforia.',
 status='El diario rosa sigue una estrategia de líderes de tres índices. Las cifras de esta página proceden del backtest con señales de cierre. Una evaluación prospectiva de la mezcla requiere sus propias órdenes registradas antes de la ejecución.',
 methods='Datos y método', limits='La cesta histórica equiponderada mantiene las acciones compradas inicialmente. RSP sigue su calendario de rebalanceo. El Top 10 histórico usa capitalización estimada o volumen en dólares y puede contar dos clases de un emisor. Costes del 0,10 % por compra y por venta, dividendos reinvertidos, sin stop. Drawdown = caída máxima entre un pico y un valle en cierres diarios.',
 data='Descargar episodios (CSV)', reference='Resultados del PR #230', sponsor='Ficha de RSP', mainlink='Abrir el diario rosa', summary='Comparar pánico bajo 20 y bajo 17'),
'en': dict(
 title='Buying below 20 or below 17',back='Panic and euphoria',stamp='Historical study in USD · Close of 23 Nov 2026',
 intro='Buy at the next close after a panic signal, hold for at least 42 calendar months and sell at the close following the first euphoria reading of 80 or higher. The two historical rules differ only in their entry threshold.',
 rsp='The proposed basket with RSP',rsp_note='Mean return per completed trade for the basket of 50% estimated Top 10 and 50% RSP. Both rules use the same nine completed panic phases with ETF prices.',
 buy='Buy below',delta='Difference across matched phases',points='percentage points',
 samples='What changes when the 2001 and 2002 crises are included?',sample_note='At threshold 20, the first table covers all 13 completed sales. The second covers the nine completed phases with RSP prices. Wins compare each basket with the S&P 500 price index on its own trade dates.',
 all='All completed sales',matched='Nine matched phases with RSP',basket='Basket',n='Sales',avg='Mean',worst='Worst final return',dd='Worst drawdown',wins='Beat S&P',
 top='Estimated Top 10',equal='Members equally weighted at entry',mix='½ Top 10 + ½ initially equal-weighted',fund='½ Top 10 + ½ RSP',
 early='The Top 10 returns of −9.2% and +2.3% came from March and September 2001. The equal-weighted basket returned +48.7% and +54.4%, respectively. Missing prices for delisted and bankrupt companies before 2010 can flatter the equal-weighted basket and its mix.',
 pr='PR #230 counts 14 observations, including 13 sales and the open April 2025 mark. On its dates (minimum 882 sessions), the Top 10 beat the index in 10/14 cases and the historical mix in 14/14. RSP launched on 24 April 2003.',
 grid='How does 17 compare with the other thresholds?',risk='Completed-trade means for the historical mix equally weighted at purchase on its broad-market half. Each threshold identifies its own episodes. Holding periods can overlap.',
 threshold='Threshold',signals='Signals',open='Open',details='Trades by phase · basket with RSP',phase='Base panic',entry='Buy',end='Sale or mark',ret='Return',mark='open',missing='RSP price unavailable',
 check='The historical mix gained 4.0 percentage points more at 17 across 13 completed sales. Omitting one phase at a time gives a range of 2.5 to 5.0 points. Eleven levels were evaluated on the same history.',
 forward='Proposed forward comparison',rules='Both proposed paper accounts would put half in the ten largest S&P 500 holdings, in proportion to weight, and half in RSP. One would require a panic reading below 20 and the other below 17, confirmed before the close. Both would use the same 42-month minimum and euphoria exit.',
 status='The pink journal tracks the leaders of three indexes. The figures here come from the historical close-signal backtest. A forward evaluation of the mix needs its own orders recorded before execution.',
 methods='Data and method',limits='The historical equal-weight sleeve holds the original names after purchase. RSP follows its own rebalancing schedule. Historical Top 10 ranks use estimated market cap or dollar volume and can count two classes of one issuer. Costs are 0.10% per purchase or sale. Dividends are reinvested and there is no stop. Drawdown is the largest peak-to-trough drop in daily closing values.',
 data='Download episodes (CSV)', reference='PR #230 results', sponsor='RSP fund details',mainlink='Open pink journal',summary='Compare buying below 20 and below 17'),
'de': dict(
 title='Panikkauf unter 20 oder unter 17',back='Panik und Euphorie',stamp='Historische Studie in USD · Börsenschluss 23.11.2026',
 intro='Kauf am nächsten Schluss nach einem Paniksignal, mindestens 42 Kalendermonate halten und am Schluss nach der ersten Euphorie-Lesung ab 80 verkaufen. Die beiden historischen Regeln unterscheiden sich nur in der Kaufschwelle.',
 rsp='Der vorgeschlagene Korb mit RSP',rsp_note='Mittlere Rendite je Verkauf für 50 % geschätzte Top 10 und 50 % RSP. Beide Regeln werden anhand derselben neun abgeschlossenen Panikphasen mit ETF-Kursen verglichen.',
 buy='Kauf unter',delta='Differenz für dieselben Phasen',points='Prozentpunkte',
 samples='Was sich mit den Krisen von 2001 und 2002 ändert',sample_note='Bei Schwelle 20 erfasst die erste Tabelle alle 13 abgeschlossenen Verkäufe. Die zweite umfasst die neun abgeschlossenen Phasen mit RSP-Kursen. Die letzte Spalte zählt die Fälle, in denen der Korb den S&P-500-Kursindex im selben Handelsfenster schlug.',
 all='Alle abgeschlossenen Verkäufe',matched='Neun vergleichbare Phasen mit RSP',basket='Korb',n='Verkäufe',avg='Mittelwert',worst='Schlechteste Endrendite',dd='Größter Drawdown',wins='Schlägt S&P',
 top='Geschätzte Top 10',equal='Mitglieder beim Kauf gleichgewichtet',mix='½ Top 10 + ½ anfangs gleichgewichtet',fund='½ Top 10 + ½ RSP',
 early='Die Top-10-Renditen von −9,2 % und +2,3 % gehören zu März und September 2001. Der gleichgewichtete Korb erreichte +48,7 % bzw. +54,4 %. Vor 2010 fehlen Kurse ausgeschiedener oder insolventer Firmen. Das kann den gleichgewichteten Korb und seine Mischung begünstigen.',
 pr='PR #230 zählt 14 Beobachtungen, darunter 13 Verkäufe und die offene Bewertung vom Einstieg im April 2025. Zu seinen Terminen (mindestens 882 Sitzungen) schlugen die Top 10 den Index in 10/14 und der historische Mix in 14/14 Fällen. RSP startete am 24.04.2003.',
 grid='Wie steht 17 im Raster aller elf Schwellen da?',risk='Durchschnitt der abgeschlossenen Verkäufe des historischen Mix mit anfangs gleichgewichtetem Marktanteil. Jede Schwelle definiert ihre eigenen Episoden. Haltefenster können sich überschneiden.',
 threshold='Schwelle',signals='Signale',open='Offen',details='Käufe je Panikphase · Korb mit RSP',phase='Basispanik',entry='Kauf',end='Verkauf oder Bewertung',ret='Rendite',mark='offen',missing='RSP-Kurs fehlt',
 check='Der Vorsprung von 17 für den historischen Mix beträgt 4,0 Prozentpunkte über 13 Verkäufe. Beim Weglassen jeweils einer Phase liegt er zwischen 2,5 und 5,0 Punkten. Alle elf Schwellen wurden anhand derselben Historie ausgewertet.',
 forward='Vorgeschlagener Paper-Vergleich',rules='Beide vorgeschlagenen Paper-Konten würden die Hälfte in die zehn größten S&P-500-Positionen proportional zu ihrem Gewicht und die andere Hälfte in RSP anlegen. Ein Konto verlangt vor Handelsschluss bestätigte Panik unter 20, das andere unter 17. Für beide gelten dieselben 42 Monate Mindesthaltedauer und derselbe Euphorieausstieg.',
 status='Das rosa Journal führt die Spitzenwerte dreier Indizes. Die Zahlen auf dieser Seite stammen aus dem historischen Backtest mit Schlusssignalen. Ein prospektiver Vergleich der Mischung braucht eigene, vor der Ausführung erfasste Orders.',
 methods='Daten und Methode',limits='Die historische Gleichgewichtung hält die ursprünglich gekauften Titel. RSP folgt seinem eigenen Rebalancing. Die historischen Top 10 beruhen auf geschätzter Marktkapitalisierung oder Handelsvolumen und können zwei Aktienklassen desselben Emittenten enthalten. Kosten je Kauf und Verkauf 0,10 %, Dividenden reinvestiert, ohne Stopp. Der Drawdown misst den größten Rückgang von einem Hoch zum folgenden Tief auf Schlusskursbasis.',
 data='Episoden herunterladen (CSV)',reference='Ergebnisse aus PR #230',sponsor='RSP-Fondsdaten',mainlink='Rosa Journal öffnen',summary='Kaufschwellen 20 und 17 vergleichen')
}

def table(headers, rows, highlight=()):
    body=[]
    for row in rows:
        cls=' class="focus"' if row[0] in highlight else ''
        body.append(f'<tr{cls}><th scope="row">{escape(row[0])}</th>'+''.join(f'<td>{escape(str(v))}</td>' for v in row[1:])+'</tr>')
    return '<div class="scroll" tabindex="0"><table><thead><tr>'+''.join(f'<th scope="col">{escape(h)}</th>' for h in headers)+'</tr></thead><tbody>'+''.join(body)+'</tbody></table></div>'

def build(lang, rows):
    t=COPY[lang]
    def fmt(x):
        val=f'{x*100:+.1f}'.replace('-','−')
        return val if lang=='en' else val.replace('.',',')
    def pct(x):return fmt(x)+' %'
    def group(level,basket):
        return {r['reference_panic']:r for r in rows if r['threshold']==level and r['basket']==basket}
    def closed(g):return {d:r for d,r in g.items() if r['status']=='closed'}
    def average(g):return mean(float(v['ret']) for v in g.values())
    def card(title,content):
        return '<section class="card"><h2>'+title+'</h2>'+content+'</section>'
    def paragraph(k):return '<p>'+t[k]+'</p>'
    actual=[closed(group(level,'mix_RSP')) for level in ('20','17')]
    assert set(actual[0])==set(actual[1])
    cards=''.join('<div class="reading">'+t['buy']+' '+level+'<b>'+pct(average(g))+'</b></div>' for level,g in zip(('20','17'),actual))
    first=card(t['rsp'],paragraph('rsp_note')+'<div class="numbers">'+cards+'</div><p>'+t['delta']+' · <strong>'+fmt(average(actual[1])-average(actual[0]))+' '+t['points']+'</strong></p>')
    def stats(subset,baskets):
        data=[]
        for symbol,label in baskets:
            selected=closed(group('20',symbol)); reference=group('20','SP500')
            use={d:selected[d] for d in subset}
            wins=sum(float(v['ret'])>float(reference[d]['ret']) for d,v in use.items())
            data.append([t[label],str(len(use)),pct(average(use)),pct(min(float(v['ret']) for v in use.values())),pct(min(float(v['mdd']) for v in use.values())),f'{wins}/{len(use)}'])
        return table([t[k] for k in ('basket','n','avg','worst','dd','wins')],data)
    baskets=[('top10_PR','top'),('equal_members','equal'),('mix','mix')]
    samples=card(t['samples'],paragraph('sample_note')+'<h3>'+t['all']+'</h3>'+stats(closed(group('20','mix')),baskets)+'<h3>'+t['matched']+'</h3>'+stats(actual[0],baskets+[('mix_RSP','fund')])+paragraph('early')+paragraph('pr'))
    grid=[]
    for level in range(20,9,-1):
        g=[r for r in rows if r['threshold']==str(level) and r['basket']=='mix']
        complete=[r for r in g if r['status']=='closed']
        grid.append([f'< {level}',str(len(g)),str(len(complete)),str(sum(r['status'].startswith('open') for r in g)),pct(mean(float(r['ret']) for r in complete)),pct(min(float(r['mdd']) for r in complete))])
    gridcard=card(t['grid'],paragraph('risk')+table([t[k] for k in ('threshold','signals','n','open','avg','dd')],grid,('< 20','< 17'))+paragraph('check'))
    detail=[]
    cohorts=[group(l,'mix_RSP') for l in ('20','17')]
    assert set(cohorts[0])==set(cohorts[1])
    for phase in sorted(cohorts[0]):
        pair=[c[phase] for c in cohorts]
        row=[phase]
        for v in pair:
            row.extend([v['entry'] if v['status']!='no_price' else '—',v['end'] if v['status']!='no_price' else '—',
                       t['missing'] if v['status']=='no_price' else pct(float(v['ret']))+(' · '+t['mark'] if v['status']!='closed' else '')])
        detail.append(row)
    events='<details class="card"><summary>'+t['details']+'</summary>'+table([t['phase']]+[s+' · '+t[key] for s in ('<20','<17') for key in ('entry','end','ret')],detail)+'</details>'
    journal='heat-leaders.html' if lang=='es' else 'heat-leaders.en.html'
    links=f'<a href="heat-comparison-events.csv">{t["data"]}</a><a href="{SOURCE}">{t["reference"]}</a><a href="{RSP}">{t["sponsor"]}</a>'
    language_links=' '.join(f'<a lang="{l}" hreflang="{l}" href="{f}">{name}</a>' for (l,f),name in zip(FILES.items(),('Español','English','Deutsch')) if l!=lang)
    return (f'<!doctype html>\n<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{t["title"]} · InvestorAce</title><link rel="icon" href="icon.svg"><link rel="stylesheet" href="heat-comparison.css"></head><body>'
            f'<nav><b>InvestorAce</b><a href="{journal}">{t["back"]}</a> {language_links}</nav><main><header><span class="meta">{t["stamp"]}</span>'
            f'<h1>{t["title"]}</h1>{paragraph("intro")}</header>'+first+samples+events+gridcard+card(t['forward'],paragraph('rules')+paragraph('status'))
            +card(t['methods'],paragraph('limits')+'<p class="links">'+links+'</p>')+f'<footer><a href="{journal}">{t["mainlink"]}</a></footer></main></body></html>\n')

def main():
    with (DIST/'heat-comparison-events.csv').open() as f: rows=list(csv.DictReader(f))
    assert {r['period'] for r in rows}=={'42m_euphoria'}
    assert len({(r['threshold'],r['signal'],r['basket']) for r in rows})==len(rows)
    for lang,filename in FILES.items():
        (DIST/filename).write_text(build(lang,rows),encoding='utf-8')

if __name__=='__main__':main()
