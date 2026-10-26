"""Performance Statistics (NetSF) — API de gráficas automáticas a partir de CSV."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime

import base64
import io

from flask import Flask, jsonify, request, send_file

from .kpis import CATEGORY_LABEL, CATEGORY_ORDER
from .analysis import AGGS, chart_payload, comparison, parse_config, summary
from .parsing import CsvError, load_csv
from .reports import build_pdf, build_xlsx, pdf_page_images

MAX_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))
log = logging.getLogger("statgraph")


def _inputs():
    files = [f for f in request.files.getlist("file") if f and f.filename]
    if not files:
        raise CsvError("Please upload at least one CSV file.")
    try:
        cfg_raw = json.loads(request.form.get("config") or "{}")
    except json.JSONDecodeError:
        raise CsvError("Invalid configuration.")
    ds = load_csv(
        [(f.filename, f.read()) for f in files],
        timestamp_column=cfg_raw.get("timestamp_column") or None,
        dayfirst=cfg_raw.get("dayfirst", True),
    )
    name = files[0].filename if len(files) == 1 else f"{len(files)} files ({', '.join(f.filename for f in files)})"
    return name, ds, parse_config(cfg_raw)


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", s).strip("_")[:60] or "report"


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024

    @app.errorhandler(CsvError)
    def _csv_error(e):
        return jsonify(error=str(e)), 400

    @app.errorhandler(413)
    def _too_big(_):
        return jsonify(error=f"The upload exceeds the {MAX_MB} MB limit."), 413

    @app.errorhandler(Exception)
    def _unexpected(e):
        if hasattr(e, "code") and isinstance(getattr(e, "code"), int):
            return jsonify(error=str(e)), e.code
        log.exception("Unhandled error")
        return jsonify(error="Internal error while processing the file."), 500

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/analyze")
    def analyze():
        name, ds, cfg = _inputs()
        return jsonify(
            file=name,
            timestamp_column=ds.timestamp_column,
            files=ds.files,
            categories=[{"key": k, "label": CATEGORY_LABEL[k]} for k in CATEGORY_ORDER],
            metrics=ds.metrics,
            summary=summary(ds),
            charts=chart_payload(ds, cfg),
            comparison=comparison(ds, cfg),
            aggs=AGGS,
            warnings=ds.warnings,
        )

    @app.post("/api/report/pdf")
    def report_pdf():
        name, ds, cfg = _inputs()
        pdf = build_pdf(ds, cfg, name)
        dl = request.args.get("download") == "1"
        return send_file(io.BytesIO(pdf), mimetype="application/pdf", as_attachment=dl,
                         download_name=f"{_slug(cfg.title)}_{datetime.now():%Y%m%d_%H%M}.pdf")

    @app.post("/api/report/preview")
    def report_preview():
        """Vista PRE: el mismo PDF que se descargará + cada página como imagen.
        Así la vista previa no depende del visor PDF del navegador (a veces bloqueado por política)."""
        name, ds, cfg = _inputs()
        pdf = build_pdf(ds, cfg, name)
        return jsonify(
            filename=f"{_slug(cfg.title)}_{datetime.now():%Y%m%d_%H%M}.pdf",
            pdf=base64.b64encode(pdf).decode(),
            pages=[base64.b64encode(p).decode() for p in pdf_page_images(pdf)],
        )

    @app.post("/api/report/xlsx")
    def report_xlsx():
        name, ds, cfg = _inputs()
        return send_file(io.BytesIO(build_xlsx(ds, cfg)), as_attachment=True,
                         mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                         download_name=f"comparison_{_slug(cfg.title)}_{datetime.now():%Y%m%d_%H%M}.xlsx")

    return app
