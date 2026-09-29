def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        s = str(v).strip().replace(",", ".")
        return float(s) if s else None
    except (ValueError, TypeError):
        return None


def _in_range(d, dfrom, dto):
    return (not dfrom or d >= dfrom) and (not dto or d <= dto)


def _ratios(at, mpt, ao, so, go):
    a = at / mpt if mpt > 0 else None
    p = ao / so if so > 0 else None
    q = go / ao if ao > 0 else None
    oee = a * p * q if (a is not None and p is not None and q is not None) else None
    return a, p, q, oee


def compute(rows, dfrom, dto):
    acc = {}
    for r in rows:
        b = r["bu"]
        if not b or not _in_range(r["tanggal"], dfrom, dto):
            continue
        a = acc.setdefault(b, {"at": 0.0, "mpt": 0.0, "ao": 0.0, "so": 0.0,
                               "go": 0.0, "target": None})
        for k in ("at", "mpt", "ao", "so", "go"):
            a[k] += _num(r[k]) or 0.0
        t = _num(r["target"])
        if t is not None and (a["target"] is None or t > a["target"]):
            a["target"] = t

    bus = []
    tot = {"at": 0.0, "mpt": 0.0, "ao": 0.0, "so": 0.0, "go": 0.0, "target": None}
    for b in sorted(acc):
        a = acc[b]
        ra, rp, rq, roee = _ratios(a["at"], a["mpt"], a["ao"], a["so"], a["go"])
        bus.append({"bu": b, "at": a["at"], "mpt": a["mpt"], "ao": a["ao"],
                    "so": a["so"], "go": a["go"], "a": ra, "p": rp, "q": rq,
                    "oee": roee, "target": a["target"]})
        for k in ("at", "mpt", "ao", "so", "go"):
            tot[k] += a[k]

    ta, tp, tq, toee = _ratios(tot["at"], tot["mpt"], tot["ao"], tot["so"], tot["go"])
    total = {"at": tot["at"], "mpt": tot["mpt"], "ao": tot["ao"], "so": tot["so"],
             "go": tot["go"], "a": ta, "p": tp, "q": tq, "oee": toee}
    return {"bus": bus, "total": total}
