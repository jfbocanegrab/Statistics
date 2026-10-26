"""Lectura y normalización de CSV de estadísticas.

Detecta automáticamente:
  * codificación (utf-8 / latin-1) y separador (, ; tab |)
  * líneas de título/pie de los reportes exportados del gestor
  * decimales con coma ("12,5")
  * columna de fecha/hora (o pareja Fecha + Hora separadas)
  * columnas numéricas (KPI)

Varios CSV = un solo reporte estadístico: se unen por fecha/hora. Cada archivo puede traer un grupo
distinto de KPI (Traffic, Throughput...); un KPI repetido en varios archivos se toma una sola vez.
"""
from __future__ import annotations

import csv
import re
import warnings
from collections import Counter
from dataclasses import dataclass, field

import pandas as pd

from .kpis import display_name, sort_kpis

TS_NAME_HINT = re.compile(r"(fecha|date|time|hora|timestamp|datetime|periodo|period|dia|day)", re.I)
TIME_ONLY = re.compile(r"^\s*\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$")


class CsvError(ValueError):
    """Error de formato que se devuelve tal cual al usuario."""


@dataclass
class Dataset:
    df: pd.DataFrame                    # columnas: "__ts" + un KPI por columna (una fila por instante)
    timestamp_column: str
    metrics: list[str]
    warnings: list[str] = field(default_factory=list)
    files: list[dict] = field(default_factory=list)   # [{name, kpis, rows}] resumen por archivo


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise CsvError("Could not detect the file encoding.")


NA_TOKENS = {"", "nil", "n/a", "na", "nan", "null", "none", "-", "--", "#n/a", "#value!", "#div/0!"}


def _read(text: str) -> tuple[pd.DataFrame, int]:
    """Lee la tabla aunque el archivo traiga líneas de título antes (p. ej. reportes exportados de
    gestores: "5G Performance Report", "Save Time :...") o un pie ("Total 30 Records").

    Se elige el separador y el número de columnas más frecuente; la cabecera es la primera línea
    con ese número de columnas y solo se conservan las filas que lo cumplen.
    """
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise CsvError("The file is empty.")
    best = None  # (filas_validas, sep, ncols)
    for sep in (";", ",", "\t", "|"):
        counts = [len(r) for r in csv.reader(lines, delimiter=sep)]
        multi = [c for c in counts if c >= 2]
        if not multi:
            continue
        ncols, freq = Counter(multi).most_common(1)[0]
        if best is None or freq > best[0]:
            best = (freq, sep, ncols)
    if best is None:
        raise CsvError("No delimiter detected (expected , ; tab or |).")
    _, sep, ncols = best
    rows = [[c.strip() for c in r] for r in csv.reader(lines, delimiter=sep)]
    start = next(i for i, r in enumerate(rows) if len(r) == ncols)
    header, body = rows[start], [r for r in rows[start + 1:] if len(r) == ncols]
    skipped = len(rows) - 1 - len(body)
    if not body:
        raise CsvError("No data rows were found below the header.")
    df = pd.DataFrame(body, columns=_unique(header), dtype=object)
    df = df.map(lambda v: None if v is None or v.strip().lower() in NA_TOKENS else v)
    df = df.dropna(how="all")
    if df.empty or len(df.columns) < 2:
        raise CsvError("The CSV needs at least one date column and one metric.")
    return df, skipped


def _unique(cols: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for c in cols:
        c = c or "Columna"
        n = seen.get(c, 0)
        seen[c] = n + 1
        out.append(c if n == 0 else f"{c} ({n + 1})")
    return out


def _to_number(s: pd.Series) -> pd.Series:
    s = s.astype(str).str.strip().str.replace("%", "", regex=False).str.replace(" ", "", regex=False)
    direct = pd.to_numeric(s, errors="coerce")
    # Formato europeo: 1.234,5 -> 1234.5
    euro = pd.to_numeric(s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")
    return euro if euro.notna().sum() > direct.notna().sum() else direct


ISO_DATE = re.compile(r"^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}")


def _to_datetime(s: pd.Series, dayfirst: bool) -> pd.Series:
    # Formato ISO (AAAA-MM-DD) nunca es "día primero"; dd/mm/aaaa sí (estándar CO/FR).
    head = s.dropna().astype(str).head(50)
    if len(head) and head.str.match(ISO_DATE).mean() > 0.8:
        dayfirst = False
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.to_datetime(s, errors="coerce", dayfirst=dayfirst, format="mixed")


def _ratio(s: pd.Series) -> float:
    return float(s.notna().mean()) if len(s) else 0.0


def _parse_one(name: str, data: bytes, timestamp_column: str | None, dayfirst: bool, multi: bool):
    """Un CSV -> (DataFrame indexado por fecha con un KPI por columna, nombre de la columna de fecha, notas)."""
    def err(msg: str) -> CsvError:
        return CsvError(f"{name}: {msg}" if multi else msg)

    if not data:
        raise err("The file is empty.")
    try:
        df, skipped = _read(_decode(data))
    except CsvError as e:
        raise err(str(e))
    notes = []
    columns = list(df.columns)

    # ---------- columna de tiempo ----------
    candidates = [timestamp_column] if timestamp_column else (
        [c for c in columns if TS_NAME_HINT.search(c)] + [c for c in columns if not TS_NAME_HINT.search(c)]
    )
    ts_col, ts = None, None
    for c in candidates:
        if c not in df.columns:
            raise err(f"Column '{c}' does not exist in the file.")
        values = df[c].dropna().astype(str)
        if values.empty or values.str.match(TIME_ONLY).mean() > 0.8:
            continue  # columna solo de hora: se combina más abajo
        if _ratio(_to_number(df[c])) > 0.9 and not TS_NAME_HINT.search(c):
            continue  # es un KPI numérico, no una fecha
        parsed = _to_datetime(df[c], dayfirst)
        if _ratio(parsed) >= 0.8:
            ts_col, ts = c, parsed
            break
    if ts_col is None:
        raise err("No recognisable date/time column was found.")

    # Fecha y Hora en columnas separadas
    used = {ts_col}
    if (ts.dropna().dt.normalize() == ts.dropna()).all():
        for c in columns:
            if c == ts_col:
                continue
            v = df[c].dropna().astype(str)
            if len(v) and v.str.match(TIME_ONLY).mean() > 0.8:
                ts = _to_datetime(df[ts_col].astype(str) + " " + df[c].astype(str), dayfirst)
                used.add(c)
                notes.append(f"Combined '{ts_col}' + '{c}' as date and time.")
                ts_col = f"{ts_col} + {c}"
                break
    if getattr(ts.dt, "tz", None) is not None:   # zonas horarias -> hora local naive
        ts = ts.dt.tz_localize(None)

    # ---------- KPI (columnas numéricas); las de texto (p. ej. "Whole Network") se ignoran ----------
    kpis = {}
    for c in columns:
        if c in used:
            continue
        n = _to_number(df[c])
        if _ratio(n[df[c].notna()]) >= 0.8 and n.notna().any():
            kpi = display_name(c)
            if kpi not in kpis:
                kpis[kpi] = n
    out = pd.DataFrame(kpis)
    out.index = ts
    bad = int(out.index.isna().sum())
    if bad:
        notes.append(f"{name}: ignored {bad} row(s) with an invalid date." if multi else
                     f"Ignored {bad} row(s) with an invalid date.")
    out = out[out.index.notna()]
    if out.index.duplicated().any():   # un solo reporte: varias filas en el mismo instante se promedian
        notes.append(f"{name}: repeated dates were averaged." if multi else "Repeated dates were averaged.")
        out = out.groupby(level=0).mean()
    return out.sort_index(), ts_col, skipped, notes


def load_csv(raw: bytes | list[tuple[str, bytes]], *, timestamp_column: str | None = None,
             dayfirst: bool = True, **_ignored) -> Dataset:
    """Lee uno o varios CSV y los une por fecha en un solo reporte estadístico."""
    files = [("file.csv", raw)] if isinstance(raw, (bytes, bytearray)) else list(raw)
    if not files:
        raise CsvError("Please upload a CSV file.")
    multi = len(files) > 1
    merged, ts_col, notes, info, skipped_total, dupes = None, None, [], [], 0, []
    for name, data in files:
        part, col, skipped, part_notes = _parse_one(name, data, timestamp_column, dayfirst, multi)
        skipped_total += skipped
        notes += part_notes
        if part.empty or not len(part.columns):
            raise CsvError(f"{name}: no numeric KPI columns were found." if multi else
                           "No numeric columns were found to plot.")
        ts_col = ts_col or col
        repeated = [k for k in part.columns if merged is not None and k in merged.columns]
        dupes += [k for k in repeated if k not in dupes]
        info.append({"name": name, "kpis": len(part.columns), "new_kpis": len(part.columns) - len(repeated),
                     "rows": int(len(part))})
        # combine_first: une fechas y KPI; si el KPI ya existe se conserva el valor ya cargado
        merged = part if merged is None else merged.combine_first(part)[list(dict.fromkeys(
            list(merged.columns) + list(part.columns)))]

    if skipped_total:
        notes.insert(0, f"Skipped {skipped_total} title/footer line(s) that are not part of the table.")
    if multi:
        notes.insert(0, f"{len(files)} files merged by date: {len(merged.columns)} KPIs, {len(merged):,} timestamps.")
    if dupes:
        notes.append(f"{len(dupes)} KPI(s) appear in more than one file and were taken only once: "
                     + ", ".join(dupes[:6]) + ("…" if len(dupes) > 6 else ""))

    # Orden de prioridad: Traffic, Users, User throughput, Accessibility, Drop, Mobility, otros, contadores
    metrics = sort_kpis(list(merged.columns))
    df = merged[metrics].reset_index(names="__ts")
    return Dataset(df=df, timestamp_column=ts_col, metrics=metrics, warnings=notes, files=info)
