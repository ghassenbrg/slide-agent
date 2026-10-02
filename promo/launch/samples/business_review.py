"""Q3 Business Review — the data deck: KPI cards, native charts, a table.

Design system: boardroom clarity. White space, ink headlines, one emerald
signal for growth; numbers carry the story.
"""

INTENT = {
    "schema": "slide-agent.intent/1",
    "brief": {"title": "Q3 2026 Business Review", "audience": "Board of directors", "goal": "Report Q3 results and agree Q4 priorities", "format": "16:9"},
    "direction": {"concept": "Boardroom clarity: generous white space, ink headlines, one emerald signal reserved for growth, and numbers that carry the story.", "fit": "ask"},
    "data": {
        "revenue": {"categories": ["Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26", "Q2 26", "Q3 26"],
                    "series": [{"name": "Revenue ($M)", "values": [31, 33, 35, 37, 40, 43, 48]}]},
        "mix": {"categories": ["Enterprise", "Mid-market", "SMB"], "series": [{"name": "Share of revenue", "values": [58, 27, 15]}]},
        "regions": {"columns": ["Region", "Revenue", "YoY", "Share"],
                    "rows": [["North America", "$21.4M", "+14%", "44%"], ["EMEA", "$14.1M", "+26%", "29%"], ["APAC", "$8.3M", "+19%", "17%"], ["LATAM", "$4.4M", "+11%", "9%"]]},
    },
    "design": {"language": {
        "color": {
            "palette": {"white": "#FFFFFF", "mist": "#F4F6F8", "ink": "#0F172A", "slate": "#5B6577", "line": "#E3E7EC",
                        "emerald": "#047857", "spring": "#10B981", "sage": "#A7D7C5", "steel": "#94A3B8", "navy": "#1E3A5F"},
            "roles": {"background": "white", "surface": "mist", "text": "ink", "muted": "slate", "accent": "emerald", "accentAlt": "navy", "rule": "line"},
            "data": ["emerald", "sage", "steel"],
        },
        "type": {"display": {"family": "Inter Tight", "weight": 700, "tracking": -0.025}, "body": {"family": "Inter", "weight": 400}, "scale": {"base": 18, "ratio": 1.25}},
        "space": {"unit": 8, "margin": 52, "gutter": 20},
        "grid": {"columns": 12, "rows": 6},
        "shape": {"radius": 12, "stroke": 0},
        "surfaces": {
            "kpi": {"fill": "white", "stroke": "line", "strokeWidth": 1, "radius": 14, "pad": "space.3"},
            "panel": {"fill": "mist", "radius": 16, "pad": "space.4"},
            "band": {"fill": "emerald"},
            "num": {"fill": "emerald", "radius": 100},
        },
        "texture": [{"id": "rule", "primitive": "underline", "params": {"width": 48, "weight": 4, "tone": "emerald"}}],
        "charts": {"axis": "hairline", "gridlines": "subtle", "labels": "end", "legend": "none"},
        "chrome": {"slideNumber": True, "footer": "Q3 2026 Business Review · Board of Directors"},
    }},
    "components": {
        "kpi": {"params": ["label", "value", "delta"], "root": {"column": {"surface": "kpi", "gap": "space.1", "justify": "center", "items": [
            {"text": "{label}", "role": "small", "tone": "muted"},
            {"text": "{value}", "role": "display", "size": 48},
            {"text": "{delta}", "role": "small", "tone": "accent", "weight": 600}]}}},
        "priority": {"params": ["n", "title", "detail"], "root": {"column": {"surface": "kpi", "gap": "space.1.5", "items": [
            {"column": {"surface": "num", "width": 40, "height": 40, "justify": "center", "items": [{"text": "{n}", "role": "h3", "tone": "white", "align": "center"}]}},
            {"text": "{title}", "role": "h3"},
            {"text": "{detail}", "role": "small", "tone": "muted"}]}}},
    },
    "slides": [
        {"id": "cover", "message": "Q3 was a record quarter, and we know where to invest next", "compose": {"grid": "12x6", "items": [
            {"at": "c1-8 r2-5", "column": {"gap": "space.3", "justify": "center", "items": [
                {"text": "Board update · Q3 2026", "role": "label", "tone": "accent", "case": "upper", "tracking": 0.05, "weight": 600},
                {"text": "Q3 2026 Business Review", "role": "title", "size": 64},
                {"texture": "rule", "height": 6},
                {"text": "Revenue, margins, and where we invest next", "role": "lead", "tone": "muted"}]}},
            {"at": "c9-12 r1-6", "bleed": ["right", "top", "bottom"], "surface": "band", "column": {"pad": "space.5", "gap": "space.1", "justify": "end", "items": [
                {"text": "+18%", "role": "display", "size": 80, "tone": "white"},
                {"text": "revenue, year over year", "role": "body", "tone": "white"}]}}]}},
        {"id": "kpis", "message": "Revenue up 18%, margin up 3 points, retention at 121%", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Q3 at a glance", "role": "title"},
            {"at": "c1-12 r2-4", "row": {"gap": "space.2", "items": [
                {"use": "kpi", "label": "Revenue", "value": "$48.2M", "delta": "▲ 18% YoY"},
                {"use": "kpi", "label": "Gross margin", "value": "64%", "delta": "▲ 3 points"},
                {"use": "kpi", "label": "Net revenue retention", "value": "121%", "delta": "▲ 4 points"},
                {"use": "kpi", "label": "New customers", "value": "312", "delta": "▲ 27% YoY"}]}},
            {"at": "c1-12 r5-6", "surface": "panel", "row": {"gap": "space.3", "align": "center", "items": [
                {"text": "Every headline metric beat plan. Enterprise drove two thirds of the growth.", "role": "lead"}]}}]}},
        {"id": "revenue", "message": "Revenue has grown seven quarters in a row", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Seven quarters of growth in a row", "role": "title"},
            {"at": "c1-8 r2-6", "chart": {"data": "revenue", "chart": "column", "highlight": "Q3 26"}},
            {"at": "c9-12 r2-6", "surface": "panel", "column": {"gap": "space.1.5", "justify": "center", "items": [
                {"text": "Q3 2026", "role": "label", "tone": "muted", "case": "upper", "tracking": 0.05},
                {"text": "$48.2M", "role": "display", "size": 56, "tone": "accent"},
                {"text": "Our best quarter ever, up 18% on Q3 last year", "role": "body", "tone": "muted"}]}}]}},
        {"id": "mix", "message": "Enterprise is now 58% of revenue", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Enterprise is now 58% of revenue", "role": "title"},
            {"at": "c1-6 r2-6", "chart": {"data": "mix", "chart": "doughnut", "highlight": "Enterprise"}},
            {"at": "c7-12 r2-6", "column": {"gap": "space.3", "justify": "center", "items": [
                {"row": {"gap": "space.2", "align": "center", "items": [{"text": "58%", "role": "h2", "tone": "accent", "width": 110}, {"text": "Enterprise — up from 49% a year ago", "role": "body"}]}},
                {"row": {"gap": "space.2", "align": "center", "items": [{"text": "27%", "role": "h2", "tone": "muted", "width": 110}, {"text": "Mid-market — steady", "role": "body"}]}},
                {"row": {"gap": "space.2", "align": "center", "items": [{"text": "15%", "role": "h2", "tone": "muted", "width": 110}, {"text": "SMB — self-serve, lowest cost to serve", "role": "body"}]}}]}}]}},
        {"id": "regions", "message": "Every region grew; EMEA grew fastest at 26%", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Every region grew. EMEA led at +26%", "role": "title"},
            {"at": "c1-8 r2-5", "table": {"data": "regions", "highlight": {"row": 1}}, "size": "+3"},
            {"at": "c9-12 r2-5", "surface": "panel", "column": {"gap": "space.1", "justify": "center", "items": [
                {"text": "EMEA", "role": "label", "tone": "muted", "case": "upper", "tracking": 0.05},
                {"text": "+26%", "role": "display", "size": 56, "tone": "accent"},
                {"text": "Two new enterprise accounts in Germany and the Nordics", "role": "body", "tone": "muted"}]}}]}},
        {"id": "priorities", "message": "Three priorities for Q4", "compose": {"grid": "12x6", "items": [
            {"at": "c1-10 r1", "text": "Three priorities for Q4", "role": "title"},
            {"at": "c1-12 r2-5", "row": {"gap": "space.2", "items": [
                {"use": "priority", "n": "1", "title": "Expand in EMEA", "detail": "Two more account teams in Germany and the Nordics"},
                {"use": "priority", "n": "2", "title": "Lift mid-market", "detail": "A guided onboarding that halves time to value"},
                {"use": "priority", "n": "3", "title": "Protect margin", "detail": "Hold gross margin above 63% while we grow"}]}}]}},
    ],
}
