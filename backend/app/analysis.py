"""Configuración del usuario, series para las gráficas y tabla comparativa."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import numpy as np
import pandas as pd

from .parsing import CsvError, Dataset

AGGS = {"mean": "Average", "sum": "Sum", "max": "Max", "min": "Min", "median": "Median"}
# Color de la celda Var % elegido por el ingeniero (por KPI); "none" = blanco
VAR_COLORS = ("none", "yellow", "green", "red")
STATUSES = ("STABLE", "IMPROVED", "DEGRADED")
STATUS_COLOR = {"STABLE": "none", "IMPROVED": "green", "DEGRADED": "red"}
STABLE_PCT = 3.0   # |Var %| <= 3 -> STABLE (blanco); fuera de ese rango -> IMPROVED (verde) / DEGRADED (rojo)

from .kpis import CATEGORY_LABEL, NO_CHART, category, higher_is_better  # noqa: E402


def auto_status(kpi: str, pct: float | None) -> str | None:
    """Estado sugerido según la variación y la dirección del KPI (el ingeniero puede cambiarlo)."""
    if pct is None:
        return None
    if abs(pct) <= STABLE_PCT:
        return "STABLE"
    return "IMPROVED" if (pct > 0) == higher_is_better(kpi) else "DEGRADED"
from .theme import EXEC_COLORS as PALETTE  # noqa: E402
MAX_POINTS = 1500
MAX_EXECUTIONS = 20


@dataclass
class Execution:
    id: str
    label: str
    day: date
    at: time | None          # None => modo "Día"
    color: str

    @property
    def mode(self) -> str:
        return "day" if self.at is None else "datetime"

    @property
    def start(self) -> datetime:
        return datetime.combine(self.day, self.at or time(0, 0))

    @property
    def end(self) -> datetime:
        return self.start if self.at else datetime.combine(self.day + timedelta(days=1), time(0, 0))

    def describe(self) -> str:
        return self.day.strftime("%d/%m/%Y") + (f" {self.at.strftime('%H:%M')}" if self.at else " (full day)")


@dataclass
class Config:
    executions: list[Execution]
    compare_days: tuple[date, date] | None   # (Día comparativo 1, Día comparativo 2), elegidos a mano
    agg: str
    metrics: list[str] | None          # KPI con gráfica en el PDF (None = todos)
    table_metrics: list[str] | None    # KPI en la tabla comparativa del PDF/Excel (None = todos)
    title: str
    var_colors: dict[str, str]
    statuses: dict[str, str]


def parse_config(cfg: dict) -> Config:
    execs = []
    for i, e in enumerate((cfg.get("executions") or [])[:MAX_EXECUTIONS]):
        try:
            d = date.fromisoformat(str(e["date"]))
        except (KeyError, ValueError):
            raise CsvError(f"Execution {i + 1}: invalid date (format YYYY-MM-DD).")
        at = None
        if e.get("mode") == "datetime":
            try:
                at = time.fromisoformat(str(e.get("time") or "00:00"))
            except ValueError:
                raise CsvError(f"Execution {i + 1}: invalid time (format HH:MM).")
        execs.append(Execution(
            id=str(e.get("id") or i),
            label=str(e.get("label") or f"Execution {i + 1}")[:60],
            day=d, at=at,
            color=str(e.get("color") or PALETTE[i % len(PALETTE)]),
        ))
    compare_days = None
    raw_days = [d for d in (cfg.get("compare_days") or []) if d]
    if raw_days:
        if len(raw_days) != 2:
            raise CsvError("Please select both comparison days.")
        try:
            compare_days = (date.fromisoformat(str(raw_days[0])), date.fromisoformat(str(raw_days[1])))
        except ValueError:
            raise CsvError("Invalid comparison days (format YYYY-MM-DD).")
    agg = cfg.get("agg", "mean")
    if agg not in AGGS:
        agg = "mean"
    metrics = cfg.get("metrics")
    return Config(
        executions=execs, compare_days=compare_days, agg=agg,
        metrics=list(metrics) if isinstance(metrics, list) else None,
        table_metrics=list(cfg["table_metrics"]) if isinstance(cfg.get("table_metrics"), list) else None,
        title=str(cfg.get("title") or "Statistics report")[:120],
        var_colors={str(k): v for k, v in (cfg.get("var_colors") or {}).items() if v in VAR_COLORS},
        statuses={str(k): v for k, v in (cfg.get("statuses") or {}).items() if v in STATUSES},
    )


def chart_metrics(ds: Dataset, cfg: Config) -> list[str]:
    """KPI con gráfica: todos menos NO_CHART, filtrados por la selección del usuario."""
    base = [m for m in ds.metrics if not NO_CHART.search(m)]
    return base if cfg.metrics is None else [m for m in base if m in cfg.metrics]


def table_metrics(ds: Dataset, cfg: Config) -> list[str]:
    """KPI en la tabla comparativa (selección independiente de las gráficas)."""
    return ds.metrics if cfg.table_metrics is None else [m for m in ds.metrics if m in cfg.table_metrics]



def iter_series(ds: Dataset, metric: str):
    """Un solo reporte estadístico: una serie (nombre, DataFrame[__ts, valor]) por KPI."""
    yield metric, ds.df[["__ts", metric]].dropna()


def _downsample(part: pd.DataFrame, metric: str) -> pd.DataFrame:
    if len(part) <= MAX_POINTS:
        return part
    bins = pd.cut(part["__ts"].astype("int64"), MAX_POINTS, labels=False)
    return part.groupby(bins).agg({"__ts": "first", metric: "mean"}).dropna()


def chart_payload(ds: Dataset, cfg: Config) -> list[dict]:
    charts = []
    for m in chart_metrics(ds, cfg):
        series = []
        for name, part in iter_series(ds, m):
            p = _downsample(part, m)
            ms = (p["__ts"].astype("datetime64[ms]").astype("int64")).tolist()
            series.append({"name": name, "points": [[t, _num(v)] for t, v in zip(ms, p[m].tolist())]})
        charts.append({"metric": m, "category": category(m), "series": series})
    return charts


def _num(v):
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return None
    return round(float(v), 6)


def _day_agg(part: pd.DataFrame, metric: str, day: date, agg: str):
    start = pd.Timestamp(day)
    sel = part[(part["__ts"] >= start) & (part["__ts"] < start + pd.Timedelta(days=1))][metric].dropna()
    if sel.empty:
        return None, 0
    return _num(getattr(sel, agg)()), int(len(sel))


def comparison(ds: Dataset, cfg: Config) -> dict | None:
    """Tabla comparativa entre los dos días comparativos elegidos por el usuario (días completos).
    Diferencia = Día 2 - Día 1; Variación % sobre el Día 1."""
    if not cfg.compare_days:
        return None
    day1, day2 = cfg.compare_days
    rows = []
    for m in table_metrics(ds, cfg):
        for name, part in iter_series(ds, m):
            v1, n1 = _day_agg(part, m, day1, cfg.agg)
            v2, n2 = _day_agg(part, m, day2, cfg.agg)
            delta = None if v1 is None or v2 is None else _num(v2 - v1)
            pct = None if delta is None or not v1 else _num(delta / abs(v1) * 100)
            sugg = auto_status(m, pct)
            status = cfg.statuses.get(m, sugg) if sugg else None          # override del ingeniero
            color = cfg.var_colors.get(m, STATUS_COLOR.get(status, "none"))  # override del ingeniero
            rows.append({
                "metric": m, "category": category(m), "higher_is_better": higher_is_better(m),
                "auto_status": sugg, "auto_color": STATUS_COLOR.get(sugg, "none"),
                "status": status, "color": color,
                "v1": v1, "v2": v2, "delta": delta, "delta_pct": pct, "n1": n1, "n2": n2,
            })
    return {
        "day1": day1.isoformat(), "day2": day2.isoformat(),
        "agg": cfg.agg, "agg_label": AGGS[cfg.agg], "rows": rows,
        "stable_pct": STABLE_PCT, "categories": CATEGORY_LABEL,
        "missing_day1": all(r["v1"] is None for r in rows),
        "missing_day2": all(r["v2"] is None for r in rows),
    }


def summary(ds: Dataset) -> dict:
    ts = ds.df["__ts"]
    uniq = pd.Series(ts.unique())
    step = uniq.diff().median() if len(uniq) > 1 else None
    return {
        "rows": int(len(ds.df)),
        "start": ts.min().isoformat() if len(ts) else None,
        "end": ts.max().isoformat() if len(ts) else None,
        "step_minutes": round(step.total_seconds() / 60, 2) if step is not None and pd.notna(step) else None,
    }
