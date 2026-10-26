"""Genera CSV de ejemplo (un solo reporte, 20 días cada 15 min):
  * ejemplo_red.csv: formato estándar (, y punto decimal); también es el "sample data" del frontend
  * ejemplo_fecha_hora_separadas.csv: formato europeo (; y coma decimal, Fecha y Hora separadas)"""
import numpy as np
import pandas as pd
from pathlib import Path

rng = np.random.default_rng(7)
idx = pd.date_range("2026-10-06", "2026-10-26 23:45", freq="15min")
hour = np.asarray(idx.hour + idx.minute / 60)
daily = np.sin((hour - 6) / 24 * 2 * np.pi)

rows = []
for k, node in enumerate(["NODO-BOG-01", "NODO-MED-02", "NODO-CLO-03"]):
    base = 1 + 0.25 * k
    cpu = 35 * base + 20 * daily + rng.normal(0, 3, len(idx))
    trafico = 800 * base + 450 * daily + rng.normal(0, 40, len(idx))
    lat = 22 / base + 6 * daily + rng.normal(0, 1.5, len(idx))
    err = np.clip(rng.poisson(3, len(idx)).astype(float), 0, None)
    after = np.asarray(idx >= "2026-10-22 22:00")        # la ejecución mejora la latencia y sube tráfico
    lat[after] *= 0.8
    trafico[after] *= 1.12
    err[(idx >= "2026-10-22 22:00") & (idx < "2026-10-23 02:00")] += 15
    for t, a, b, c, d in zip(idx, cpu, trafico, lat, err):
        rows.append((t, node, a, b, c, d))

df = pd.DataFrame(rows, columns=["timestamp", "nodo", "cpu_pct", "trafico_mbps", "latencia_ms", "errores"])
out = Path(__file__).parent
red = df[df.nodo == "NODO-BOG-01"].drop(columns="nodo").round(2)
red.to_csv(out / "ejemplo_red.csv", index=False)
red.to_csv(out.parent / "frontend" / "public" / "ejemplo.csv", index=False)

eu = df[df.nodo == "NODO-BOG-01"].drop(columns="nodo").copy()
eu.insert(0, "Fecha", eu.timestamp.dt.strftime("%d/%m/%Y"))
eu.insert(1, "Hora", eu.timestamp.dt.strftime("%H:%M"))
eu = eu.drop(columns="timestamp").round(2)
eu.to_csv(out / "ejemplo_fecha_hora_separadas.csv", index=False, sep=";", decimal=",")
print("ok", len(df), len(eu))
