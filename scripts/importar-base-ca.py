"""Prepara a base local de consulta a partir da exportação CSV do CAEPI."""

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import zlib
from datetime import date, datetime
from pathlib import Path


def import_catalog(source: Path, base_date: str | None):
    raw = source.read_bytes()
    payload = zlib.decompress(raw, 31) if raw.startswith(b"\x1f\x8b") else raw
    text = payload.decode("utf-8-sig").lstrip("\r\n\ufeff")
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=";")
    columns = ("NR Registro CA", "EQUIPAMENTO", "RAZAO SOCIAL", "REFERENCIA", "DATA DE VALIDADE", "SITUACAO")
    if not set(columns).issubset(reader.fieldnames or []):
        raise ValueError("O CSV não tem os campos esperados da exportação do CAEPI.")

    if base_date is None:
        match = re.match(r"RelatorioCA_(\d{8})", source.name)
        if not match:
            raise ValueError("Informe a data da exportação com --data no formato AAAA-MM-DD.")
        base_date = datetime.strptime(match[1], "%Y%m%d").date().isoformat()
    base_date = date.fromisoformat(base_date).isoformat()

    catalog = {}
    rows = 0
    for row in reader:
        ca, name, manufacturer, reference, expiry, status = (" ".join((row[column] or "").split()) for column in columns)
        if not re.fullmatch(r"[0-9]{1,10}", ca) or not int(ca) or not name:
            raise ValueError(f"Linha {reader.line_num} com número de CA ou equipamento inválido.")
        expires = datetime.strptime(expiry, "%d/%m/%Y").date().isoformat()
        entry = (name, manufacturer, reference, expires, status)
        catalog.setdefault(str(int(ca)), set()).add(entry)
        rows += 1
    if not catalog:
        raise ValueError("A exportação não contém registros de CA.")
    return {
        "exportedOn": base_date,
        "sourceFile": source.name,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "sourceRows": rows,
        "certificates": {key: sorted(records) for key, records in sorted(catalog.items(), key=lambda pair: int(pair[0]))},
    }


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("arquivo", type=Path)
    args.add_argument("--data", help="Data da exportação em AAAA-MM-DD, quando ausente no nome do arquivo")
    options = args.parse_args()
    result = import_catalog(options.arquivo, options.data)
    output = Path(__file__).resolve().parents[1] / "data" / "ca-catalogo.json.gz"
    output.parent.mkdir(exist_ok=True)
    compressed = gzip.compress(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
    temporary = output.with_suffix(".tmp")
    temporary.write_bytes(compressed)
    temporary.replace(output)
    catalog = result["certificates"]
    print(f"{result['sourceRows']} linhas, {len(catalog)} CAs, {sum(len(rows) > 1 for rows in catalog.values())} CAs com variantes.")


if __name__ == "__main__":
    main()
