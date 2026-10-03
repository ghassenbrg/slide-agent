"""Directed intent for the Fern launch-plan deck.

Request this deck answers (shown verbatim in the film):
  "Create a launch plan for our new app: timeline, budget and risks."

Authored by the agent in this session with the Slide Agent skill. Positions are
art-directed in inches and converted to the grammar's free-placement grid units
(12 x 6 over the content box inside a 0.5 in margin).
"""
import json, pathlib

OUT = pathlib.Path(__file__).with_name('intent.json')
CW, CH = 12.3333 / 12, 6.5 / 6          # one grid unit, in inches
FOOT = 'Fern — Launch plan  ·  Illustrative demo'


CTX = [(.5, .5, CW, CH)]                 # (origin x, origin y, unit w, unit h) of the current container


def box(x, y, w, h):
    ox, oy, uw, uh = CTX[-1]
    return [round((x - ox) / uw, 4), round((y - oy) / uh, 4), round(w / uw, 4), round(h / uh, 4)]


def T(text, x, y, w, h, size, tone='ink', weight=None, role='body', font=None, **kw):
    if role == 'small' and size < 12: role = 'caption'
    n = {'text': text, 'role': role, 'size': size, 'tone': tone, 'box': box(x, y, w, h)}
    if weight: n['weight'] = weight
    if font: n['font'] = font
    n.update(kw)
    return n


def S(shape, x, y, w, h, fill, **kw):
    n = {'shape': shape, 'decorative': True, 'fill': fill, 'box': box(x, y, w, h)}
    n.update(kw)
    return n


def card(x, y, w, h, fill='white', shadow=True, radius=12, kids=lambda: []):
    """A surface whose children are given in absolute slide inches."""
    surf = {'fill': fill, 'radius': radius}
    if shadow: surf['shadow'] = 'soft'
    b = box(x, y, w, h)
    CTX.append((x, y, w / 12, h / 6))
    items = kids() or [{'space': 'space.1', 'box': [0, 0, 1, 1]}]
    CTX.pop()
    return {'surface': surf, 'free': {'items': items}, 'box': b}


def icon(name, x, y, s, tone):
    px = round(s * 72)
    return {'icon': name, 'tone': tone, 'size': px, 'width': px, 'height': px, 'box': box(x, y, s, s)}


def chrome(n, label):
    return [
        icon('leaf', .5, .47, .22, 'forest'),
        T(label, .8, .45, 7, .26, 10.5, 'forest', 'bold', 'label', tracking=.1, valign='middle'),
        S('rect', .5, 6.72, 12.333, .012, 'track'),
        T(FOOT, .5, 6.8, 8, .22, 10, 'moss', role='caption'),
        T(f'0{n} / 05', 11.33, 6.8, 1.5, .22, 10, 'moss', role='caption', align='right'),
    ]


def title(t, sub, size=30):
    return [
        T(t, .5, .85, 12.3, .62, size, 'ink', 'bold', 'title'),
        T(sub, .5, 1.5, 11.5, .36, 15, 'moss', role='small'),
    ]


# ── 1 · Dashboard ────────────────────────────────────────────────────────────
ms = [
    ('Jan 12', 'Private beta', 'Done', 'done'),
    ('Feb 2', 'Store submission', 'Next', 'next'),
    ('Feb 23', 'Press preview', 'Planned', 'plan'),
    ('Mar 18', 'Launch', 'Launch day', 'launch'),
    ('Apr 15', '30-day review', 'Planned', 'plan'),
]


def target_kids():
    return [
        T('30-DAY TARGET', .8, 2.55, 2.5, .25, 10.5, 'lime', 'bold', 'label', tracking=.1),
        T('50K', .8, 2.85, 2.6, .85, 56, 'white', 'bold', 'display'),
        T('installs after launch', .8, 3.68, 2.5, .3, 13.5, 'mintText', role='small'),
        S('rect', .8, 4.02, 2.4, .01, 'forestLine'),
        T('4.5 rating  ·  25% week-4 active', .8, 4.08, 2.6, .24, 10.5, 'lime', 'bold', role='caption'),
    ]


def timeline_kids():
    k = [
        T('Timeline', 4.0, 2.5, 3, .32, 15.5, 'ink', 'bold', 'h3'),
        T('12 weeks  ·  Jan 4 – Mar 26', 9.0, 2.52, 3.53, .28, 11, 'moss', role='caption', align='right'),
        S('roundRect', 4.45, 3.42, 7.75, .05, 'track', radius=2),
        S('roundRect', 4.45, 3.42, 2.95, .05, 'forest', radius=2),
    ]
    for i, (d, name, st, kind) in enumerate(ms):
        cx = 4.45 + i * 1.9375
        r = .3 if kind == 'launch' else .22
        if kind == 'done':
            k += [S('ellipse', cx - r / 2, 3.445 - r / 2, r, r, 'white'), icon('circle-check', cx - r / 2, 3.445 - r / 2, r, 'forest')]
        elif kind == 'next':
            k += [S('ellipse', cx - r / 2, 3.445 - r / 2, r, r, 'white', stroke='forest', strokeWidth=2.5), S('ellipse', cx - .05, 3.395, .1, .1, 'forest')]
        elif kind == 'launch':
            k += [S('ellipse', cx - r / 2, 3.445 - r / 2, r, r, 'lime', stroke='forestDeep', strokeWidth=2.5)]
        else:
            k += [S('ellipse', cx - r / 2, 3.445 - r / 2, r, r, 'white', stroke='planned', strokeWidth=2)]
        launch = kind == 'launch'
        k += [
            T(d, cx - .8, 3.0, 1.6, .24, 11, 'forest' if launch else 'moss', 'bold' if launch else None, 'caption', align='center'),
            T(name, cx - .92, 3.7, 1.84, .28, 14 if launch else 13, 'forestDeep' if launch else 'ink', 'bold', 'small', align='center'),
            T(st, cx - .8, 3.98, 1.6, .24, 10.5, 'moss' if kind == 'plan' else 'forest', 'bold' if launch else None, 'caption', align='center'),
        ]
    return k


budget = [('Paid social', 160, 'forest'), ('Creators', 95, 'forest'), ('PR & events', 70, 'leaf'), ('App store ads', 55, 'leaf'), ('Contingency', 40, 'sand')]


def budget_kids():
    k = [T('Budget', .8, 4.73, 2, .32, 15.5, 'ink', 'bold', 'h3'),
         T('$420K total', 4.2, 4.73, 2.0, .32, 15.5, 'forest', 'bold', 'h3', align='right')]
    for i, (lab, v, col) in enumerate(budget):
        y = 5.17 + i * .27
        k += [
            T(lab, .8, y, 1.55, .24, 11, 'ink', role='caption', valign='middle'),
            S('roundRect', 2.4, y + .06, 3.05, .12, 'track', radius=3),
            S('roundRect', 2.4, y + .06, 3.05 * v / 160, .12, col, radius=3),
            T(f'${v}K', 5.5, y, .7, .24, 11, 'ink', 'bold', 'caption', align='right', valign='middle'),
        ]
    return k


risks = [('High', 'App Store review slips past March 1', 'Dana · Product', 'coral', 'coralSoft'),
         ('Medium', 'Bank-connection limits at peak sign-up', 'Omar · Eng', 'amberText', 'amberSoft'),
         ('Medium', 'Support volume in launch week', 'Lena · Support', 'amberText', 'amberSoft')]


def pill(text, x, y, w, h, tc, bg, size=10):
    return {'surface': {'fill': bg, 'radius': 100}, 'row': {'items': [{'text': text, 'role': 'caption', 'size': size, 'weight': 'bold', 'tone': tc, 'align': 'center'}], 'justify': 'center', 'align': 'center'}, 'box': box(x, y, w, h)}


def risk_kids():
    k = [T('Risks', 7.0, 4.73, 2, .32, 15.5, 'ink', 'bold', 'h3'),
         T('3 open  ·  each has an owner', 9.6, 4.75, 2.93, .28, 11, 'moss', role='caption', align='right')]
    for i, (sev, t, own, tc, bg) in enumerate(risks):
        y = 5.18 + i * .44
        k += [pill(sev, 7.0, y + .03, .78, .25, tc, bg),
              T(t, 7.92, y, 3.4, .3, 12.5, 'ink', 'bold', 'small', valign='middle'),
              T(own, 11.2, y, 1.33, .3, 10.5, 'moss', role='caption', align='right', valign='middle')]
        if i < 2:
            k.append(S('rect', 7.0, y + .385, 5.53, .01, 'track'))
    return k


s1 = [
    icon('leaf', .5, .47, .26, 'forest'),
    T('FERN', .84, .45, 2, .3, 12.5, 'ink', 'bold', 'label', tracking=.28, valign='middle'),
    T('LAUNCH PLAN   ·   Q1 2027   ·   LEADERSHIP REVIEW', 6.2, .45, 6.63, .3, 10.5, 'moss', 'bold', 'label', align='right', tracking=.1, valign='middle'),
    T('Fern launches March 18.', .5, .9, 10, .8, 42, 'ink', 'bold', 'title'),
    T('Twelve weeks from private beta to public launch, with a $420K budget and three named risks.', .5, 1.72, 11, .36, 15.5, 'moss', role='small'),
    card(.5, 2.3, 3.0, 2.08, 'forestDeep', kids=target_kids),
    card(3.7, 2.3, 9.133, 2.08, kids=timeline_kids),
    card(.5, 4.55, 6.0, 2.02, kids=budget_kids),
    card(6.7, 4.55, 6.133, 2.02, kids=risk_kids),
    T(FOOT, .5, 6.8, 8, .22, 10, 'moss', role='caption'),
    T('01 / 05', 11.33, 6.8, 1.5, .22, 10, 'moss', role='caption', align='right'),
]

# ── 2 · Timeline ────────────────────────────────────────────────────────────
X0, WK = 2.55, 10.28 / 12
def wx(w): return X0 + (w - 1) * WK
s2 = chrome(2, 'LAUNCH PLAN  ·  TIMELINE') + title('Twelve weeks, three teams, one launch date.',
     'Store submission on February 2 is the gate: it leaves six weeks of review buffer before March 18.')
for i, m in enumerate(['January', 'February', 'March']):
    s2 += [T(m, wx(1 + 4 * i) + .06, 2.2, 3.3, .3, 14, 'ink', 'bold', 'h3'),
           S('rect', wx(1 + 4 * i), 2.55, 4 * WK - .06, .035, 'forest' if i == 0 else 'track')]
for w in range(1, 13):
    s2.append(T(f'W{w}', wx(w), 2.63, WK, .22, 10, 'moss', role='caption', align='center'))
lanes = [
    ('Product', 'forest', [(2, 4, 'Private beta'), (5, 8, 'Fixes and polish'), (9, 10, 'Release build')]),
    ('Marketing', 'leafDeep', [(1, 5, 'Waitlist'), (6, 9, 'Creator content'), (10, 12, 'Launch campaign')]),
    ('Support', 'teal', [(3, 6, 'Help center'), (7, 9, 'Team training'), (10, 12, 'Launch-week desk')]),
]


def lane_kids(y, lane, col, bars):
    def f():
        k = [T(lane, .72, y, 1.7, .46, 14, 'ink', 'bold', 'small', valign='middle')]
        for a, b, lab in bars:
            k.append({'surface': {'fill': col, 'radius': 100}, 'row': {'items': [{'text': lab, 'role': 'caption', 'size': 11, 'weight': 'bold', 'tone': 'white'}], 'pad': [0, 12, 0, 12], 'align': 'center'},
                      'box': box(wx(a) + .03, y + .04, (b - a + 1) * WK - .06, .38)})
        return k
    return f


mil = [(5 + 1 / 7, 'Feb 2', 'Store submission', 'forest', 'r'), (8 + 1 / 7, 'Feb 23', 'Press preview', 'forest', 'r'), (11 + 3 / 7, 'Mar 18', 'Launch', 'lime', 'l')]
for w, d, lab, col, side in mil:          # guide lines sit behind the lanes
    s2.append(S('rect', wx(w) - .006, 2.92, .012, 2.48, 'forest' if col == 'lime' else 'planned'))
for li, (lane, col, bars) in enumerate(lanes):
    y = 3.05 + li * .72
    s2.append(card(.5, y - .08, 12.333, .62, 'laneBg', shadow=False, radius=8, kids=lane_kids(y, lane, col, bars)))
s2 += [T('Milestones', .72, 5.33, 1.7, .4, 14, 'ink', 'bold', 'small', valign='middle')]
for w, d, lab, col, side in mil:
    x = wx(w)
    s2 += [S('diamond', x - .11, 5.42, .22, .22, col, **({'stroke': 'forestDeep', 'strokeWidth': 2} if col == 'lime' else {}))]
    if side == 'r':
        s2.append(T(f'**{d}**  {lab}', x + .17, 5.36, 2.2, .34, 12, 'ink', role='small', valign='middle'))
    else:
        s2.append(T(f'**{d}**  {lab}', x + .17, 5.36, 1.25, .34, 12, 'forestDeep', role='small', valign='middle'))


def band_kids():
    return [T('Every team finishes its build work by week 10, so launch week is execution only.', .78, 5.97, 11.8, .48, 14.5, 'forestDeep', 'bold', 'body', valign='middle')]


s2.append(card(.5, 5.92, 12.333, .58, 'mint', shadow=False, radius=10, kids=band_kids))

# ── 3 · Budget ──────────────────────────────────────────────────────────────
s3 = chrome(3, 'LAUNCH PLAN  ·  BUDGET') + title('Paid social and creators carry 61% of the budget.',
     '$420K across five channels. The $40K contingency is released only with approval in launch week.')
s3 += [
    {'chart': {'data': 'budget', 'chart': 'bar', 'labels': 'end', 'axis': 'none', 'highlight': ['Paid social', 'Creators'],
               'alt': 'Launch budget by channel in thousands of dollars: paid social 160, creators 95, PR and events 70, app store ads 55, contingency 40.'},
     'box': box(.4, 2.15, 7.7, 4.35)},
    S('rect', 8.55, 2.25, .012, 4.2, 'track'),
    T('$420K', 8.95, 2.2, 3.9, .95, 60, 'forest', 'bold', 'display'),
    T('Total launch budget', 8.95, 3.15, 3.9, .32, 16, 'ink', 'bold', 'h3'),
    T('January 4 to April 15', 8.95, 3.48, 3.9, .28, 12.5, 'moss', role='small'),
    S('rect', 8.95, 3.98, 3.88, .012, 'track'),
    T('61%', 8.95, 4.12, 1.7, .66, 36, 'leafDeep', 'bold', 'display'),
    T('Paid social and creators', 10.55, 4.2, 2.3, .26, 13, 'ink', 'bold', 'small'),
    T('$255K of $420K', 10.55, 4.47, 2.3, .26, 12, 'moss', role='small'),
    S('rect', 8.95, 5.0, 3.88, .012, 'track'),
    T('$40K', 8.95, 5.14, 1.7, .66, 36, 'ink', 'bold', 'display'),
    T('Contingency', 10.55, 5.22, 2.3, .26, 13, 'ink', 'bold', 'small'),
    T('Held until launch week', 10.55, 5.49, 2.3, .26, 12, 'moss', role='small'),
]

# ── 4 · Risks ───────────────────────────────────────────────────────────────
s4 = chrome(4, 'LAUNCH PLAN  ·  RISKS') + title('Three risks. Each one has an owner and a trigger.',
     'Reviewed every Monday. A tripped trigger goes to the launch lead within 24 hours.')
rk = [
    ('High', 'coral', 'coralSoft', 'clock', 'App Store review slips', 'Launch date moves and paid media is wasted.',
     'Submit on Feb 2, keeping six weeks of buffer.', 'No approval by March 1.', 'DK', 'Dana Kim', 'Product lead'),
    ('Medium', 'amberText', 'amberSoft', 'landmark', 'Bank-connection limits', 'New users fail to link accounts in week one.',
     'Raise partner quota; queue links at peak.', 'Link failures above 3%.', 'OR', 'Omar Reyes', 'Engineering'),
    ('Medium', 'amberText', 'amberSoft', 'headset', 'Launch-week support load', 'Slow replies pull the store rating down.',
     'Train six extra agents; in-app help first.', 'First reply over 4 hours.', 'LN', 'Lena Novak', 'Support'),
]


def risk_card(x, w, sev, tc, bg, ic, t, imp, mit, trig, ini, who, team):
    def f():
        k = [pill(sev + ' risk', x + .3, 2.48, 1.2, .28, tc, bg, 10.5),
             icon(ic, x + w - .62, 2.45, .32, 'forest'),
             T(t, x + .3, 2.92, w - .6, .36, 18, 'ink', 'bold', 'h3')]
        for j, (lab, txt) in enumerate([('IMPACT', imp), ('MITIGATION', mit), ('TRIGGER', trig)]):
            y = 3.46 + j * .78
            k += [T(lab, x + .3, y, 2, .22, 10, 'forest', 'bold', 'label', tracking=.1),
                  T(txt, x + .3, y + .24, w - .6, .48, 12.5, 'ink', role='small')]
        k += [S('rect', x + .3, 5.82, w - .6, .01, 'track'),
              S('ellipse', x + .3, 5.95, .4, .4, 'mint'),
              T(ini, x + .3, 5.95, .4, .4, 10.5, 'forestDeep', 'bold', 'caption', align='center', valign='middle'),
              T(f'**{who}**  ·  {team}', x + .82, 5.98, w - 1.1, .34, 12, 'ink', role='small', valign='middle')]
        return k
    return f


for i, r in enumerate(rk):
    x, w = .5 + i * 4.183, 3.967
    s4.append(card(x, 2.2, w, 4.3, kids=risk_card(x, w, *r)))

# ── 5 · Decision ────────────────────────────────────────────────────────────
s5 = [
    icon('leaf', .5, .47, .22, 'lime'),
    T('LAUNCH PLAN  ·  DECISION', .8, .45, 7, .26, 10.5, 'lime', 'bold', 'label', tracking=.1, valign='middle'),
    T('Approve $420K and the March 18 date by January 15.', .5, 1.35, 7.3, 2.1, 44, 'white', 'bold', 'title', leading=1.08),
    T('A decision this month protects the February 2 store submission and the creator bookings behind it.', .5, 3.6, 6.8, .7, 16, 'mintText', role='body'),
    T('WHAT WE COMMIT TO, 30 DAYS AFTER LAUNCH', 8.4, 1.4, 4.43, .26, 10.5, 'lime', 'bold', 'label', tracking=.1),
]


def goal(y, big, lab):
    return lambda: [T(big, 8.7, y + .2, 1.9, .76, 40, 'lime', 'bold', 'display', valign='middle'),
                    T(lab, 10.55, y + .2, 2.1, .76, 14, 'white', 'bold', 'small', valign='middle')]


for i, (big, lab) in enumerate([('50K', 'app installs'), ('4.5', 'average star rating in the stores'), ('25%', 'of new users still active in week 4')]):
    y = 1.85 + i * 1.32
    s5.append(card(8.4, y, 4.433, 1.16, 'forestCard', shadow=False, radius=12, kids=goal(y, big, lab)))
s5 += [S('rect', .5, 6.0, 7.3, .012, 'forestLine'),
       T('**Next review: April 15**, 30 days after launch, against these three goals.', .5, 6.12, 7.3, .32, 13.5, 'white', role='small'),
       T(FOOT, .5, 6.8, 8, .22, 10, 'mintText', role='caption'),
       T('05 / 05', 11.33, 6.8, 1.5, .22, 10, 'mintText', role='caption', align='right')]

intent = {
    'schema': 'slide-agent.intent/1',
    'brief': {'title': 'Fern — Launch plan', 'audience': 'Company leadership approving an app launch',
              'goal': 'Approve the March 18 launch date and the $420K budget.', 'format': '16:9'},
    'direction': {'concept': 'Calm, confident launch plan for a personal-finance app: warm paper, deep forest green and one lime signal colour; Helvetica Neue with heavy, tight headlines; each slide makes one claim and shows the evidence for it.', 'fit': 'ask'},
    'design': {'language': {
        'color': {
            'palette': {'paper': '#F6F4EE', 'white': '#FFFFFF', 'ink': '#10261D', 'moss': '#5B6A62', 'forest': '#1E6B4A',
                        'forestDeep': '#123526', 'forestCard': '#1B4734', 'forestLine': '#2E5E48', 'leaf': '#5FAE7E', 'leafDeep': '#2F7A51', 'teal': '#1F7273',
                        'lime': '#C9F26B', 'mint': '#E2F1E7', 'mintText': '#CFE5D8', 'sand': '#CFC7B4', 'track': '#E7E3D8',
                        'laneBg': '#EFECE3', 'planned': '#B9B3A4', 'coral': '#BC3C25', 'coralSoft': '#FBE4DD',
                        'amberText': '#8A5A00', 'amberSoft': '#FAEFD2'},
            'roles': {'background': 'paper', 'surface': 'white', 'text': 'ink', 'muted': 'moss', 'accent': 'forest', 'rule': 'track'},
            'data': ['leaf', 'forest']},
        'type': {'display': {'family': 'Helvetica Neue', 'weight': 700, 'tracking': -0.02},
                 'body': {'family': 'Helvetica Neue', 'weight': 400}, 'mono': {'family': 'Menlo'},
                 'scale': {'base': 16, 'ratio': 1.25}},
        'space': {'unit': 8, 'margin': 36, 'gutter': 16}, 'grid': {'columns': 12, 'rows': 6},
        'shape': {'radius': 12, 'stroke': 0}, 'texture': [],
        'charts': {'axis': 'none', 'gridlines': 'none', 'labels': 'end', 'highlight': 'forest', 'legend': 'none'},
        'chrome': {'slideNumber': False}}},
    'data': {'budget': {'categories': ['Paid social', 'Creators', 'PR & events', 'App store ads', 'Contingency'],
                        'series': [{'name': 'Budget ($K)', 'values': [160, 95, 70, 55, 40]}], 'unit': 'K'}},
    'slides': [
        {'id': 'dashboard', 'message': 'Fern launches March 18 with a $420K budget and three owned risks', 'background': 'paper',
         'notes': 'Fictional demonstration content.', 'compose': {'free': {'items': s1}}},
        {'id': 'timeline', 'message': 'Twelve weeks, three teams, one launch date', 'background': 'paper', 'compose': {'free': {'items': s2}}},
        {'id': 'budget', 'message': 'Paid social and creators carry 61% of the $420K budget', 'background': 'paper', 'compose': {'free': {'items': s3}}},
        {'id': 'risks', 'message': 'Three risks, each with an owner and a trigger', 'background': 'paper', 'compose': {'free': {'items': s4}}},
        {'id': 'decision', 'message': 'Approve $420K and the March 18 date by January 15', 'background': 'forestDeep', 'compose': {'free': {'items': s5}}},
    ],
}
OUT.write_text(json.dumps(intent, indent=1, ensure_ascii=False))
print('wrote', OUT)
