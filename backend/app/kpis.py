"""Nombres, categorías, orden y dirección (mejor/peor) de los KPI de reportes 4G y 5G.

Orden de prioridad acordado con operaciones:
  1 Traffic · 2 Users · 3 User throughput (DL, UL) · 4 Availability & accessibility
  5 Retainability (drop) · 6 Mobility · 7 Other KPIs · 8 Counters

La clasificación se hace por palabras del nombre del KPI, así sirve para cualquier reporte del gestor
(4G, 5G NSA...) aunque traiga KPI nuevos. Dentro de cada categoría el orden lo da la lista de patrones
y, si empatan, el orden en que vienen en los CSV.
"""
from __future__ import annotations

import re

# (clave, etiqueta, [patrones en orden de prioridad dentro de la categoría])
CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("counters", "Counters", [r"^[ln]\.[a-z]"]),     # contadores crudos L.xxx / N.xxx (se evalúa primero)
    ("traffic", "Traffic", [
        r"\bdl\b.*(volume|traffic)|(volume|traffic).*\bdl\b",
        r"\bul\b.*(volume|traffic)|(volume|traffic).*\bul\b",
        r"traffic|data volume|\(erl\)",
    ]),
    ("user_tput", "User Throughput", [
        r"\bdl\b.*user.*throughput|user.*\bdl\b.*throughput",
        r"\bul\b.*user.*throughput|user.*\bul\b.*throughput",
        r"user.*throughput",
    ]),
    ("users", "Users", [
        r"average.*user number|user number.*avg",
        r"active user",
        r"connected.*users?",
        r"max(imum)?.*user",
        r"users?\b",
    ]),
    ("access", "Availability & Accessibility", [
        r"availability",
        r"rrc setup|rrc.*conn.*(setup|estab)",
        r"e-?rab setup",
        r"s1sig|connestab",
        r"sg-?nb.*addition|sgnb.*add.*s(r|uccess)",
        r"\b(non-?cb|cb)\b.*\bra\b|\bra\b.*success|rach",
        r"paging",
        r"setup|access",
    ]),
    ("retain", "Retainability (Drop)", [
        r"e-?rab\s*dr\b|drop",
        r"\bdr\b",
        r"abnorm",
        r"re-?estab",
        r"release rate|retain",
    ]),
    ("mobility", "Mobility", [
        r"intra.?freq.*\bho\b",
        r"inter.?freq.*\bho\b",
        r"^(?!.*(csfb|srvcc|inter ?rat|irat)).*(\bho\b|handover)",   # HO LTE/NR (sin IRAT/CSFB/SRVCC)
        r"pscell change|pscell.*sr\b",
        r"^(?!.*csfb).*(inter ?rat|irat|l2u|redirect)",
        r"csfb",
        r"srvcc",
    ]),
    ("other", "Other KPIs", [
        r"throughput",
        r"cqi",
        r"prb|resource block|\brb\b",
        r"bler",
        r"modulation|qam|qpsk",
        r"packet loss",
        r"vqi|silence",
        r"",
    ]),
]
CATEGORY_ORDER = ["traffic", "users", "user_tput", "access", "retain", "mobility", "other", "counters"]
CATEGORY_LABEL = {k: label for k, label, _ in CATEGORIES}
_COMPILED = [(k, [re.compile(p, re.I) for p in pats]) for k, _, pats in CATEGORIES]

# KPI en los que "mayor es peor" (subir = degradación). El resto: mayor es mejor.
LOWER_IS_BETTER = re.compile(
    r"(loss|drop|abnorm|\bdr\b|discard|interference|latency|delay|error|fail|bler|congest|retrans|jitter|block"
    r"|silence|redirect|l2u|uelost|scgfail|coverage|reest\.att|qpsk)", re.I)

# KPI que nunca se grafican (Integrity es la completitud del reporte, no un KPI de desempeño)
NO_CHART = re.compile(r"\bintegrity\b", re.I)


def display_name(column: str) -> str:
    """Nombre visible del KPI. Convención NetSF: todo KPI empieza con "NetSF".
    "availability_netsf" -> "NetSF AVAILABILITY" (en mayúscula y sin el sufijo _netsf)."""
    c = column.strip()
    m = re.match(r"^(netsf[\s_]+)?(.*?)[\s_]+netsf$", c, re.I)
    if m:
        c = m.group(2).replace("_", " ").upper()
    return c if c.lower().startswith("netsf") else f"NetSF {c}"


def _bare(kpi: str) -> str:
    return re.sub(r"^netsf[\s_]+", "", kpi, flags=re.I)


def classify(kpi: str) -> tuple[str, int]:
    """(categoría, índice del patrón dentro de la categoría)."""
    name = _bare(kpi)
    for key, pats in _COMPILED:
        for i, p in enumerate(pats):
            if p.search(name):
                return key, i
    return "other", 99


def category(kpi: str) -> str:
    return classify(kpi)[0]


def sort_kpis(kpis: list[str]) -> list[str]:
    pos = {k: i for i, k in enumerate(kpis)}

    def key(k):
        cat, sub = classify(k)
        return CATEGORY_ORDER.index(cat), sub, pos[k]
    return sorted(kpis, key=key)


def higher_is_better(kpi: str) -> bool:
    return not LOWER_IS_BETTER.search(_bare(kpi))
