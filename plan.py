EST_UNIT_RATIO_MAX = 20.0


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


def compute(est_rows, act_rows, dfrom, dto):
    act, pmap, bu_real_m = {}, {}, {}
    for r in act_rows:
        p, d = r["kode_pabrik"], r["tanggal"]
        if p and _in_range(d, dfrom, dto):
            v = _num(r["real_ctn"]) or 0.0
            act[(p, d)] = act.get((p, d), 0.0) + v
            b = r["bu"]
            if b:
                pmap[p] = b
                k = (b, d[:7])
                bu_real_m[k] = bu_real_m.get(k, 0.0) + v

    line_real_m = {}
    for r in est_rows:
        d = r["tanggal"]
        b = r["bu"]
        if b and _in_range(d, dfrom, dto):
            k = (b, r["line"], d[:7])
            v = _num(r["lhp_real"]) or 0.0
            line_real_m[k] = line_real_m.get(k, 0.0) + v
    bad_lines = {(b, ln, m) for (b, ln, m), v in line_real_m.items()
                 if v > 0 and bu_real_m.get((b, m), 0.0) > 0
                 and v > EST_UNIT_RATIO_MAX * bu_real_m[(b, m)]}

    est = {}
    for r in est_rows:
        p, d = r["kode_pabrik"], r["tanggal"]
        if p and _in_range(d, dfrom, dto):
            b = r["bu"]
            if (b, r["line"], d[:7]) in bad_lines:
                continue
            if b:
                pmap[p] = b
            v = _num(r["lhp_est"]) or 0.0
            est[(p, d)] = est.get((p, d), 0.0) + v

    plan_by_p, act_by_p = {}, {}
    est_dates_by_p, act_dates_by_p = {}, {}
    for (p, d), v in est.items():
        plan_by_p[p] = plan_by_p.get(p, 0.0) + v
        est_dates_by_p.setdefault(p, set()).add(d)
    for (p, d), v in act.items():
        act_by_p[p] = act_by_p.get(p, 0.0) + v
        act_dates_by_p.setdefault(p, set()).add(d)

    plants, skipped = [], []
    bus_acc = {}
    for p in sorted(set(plan_by_p) | set(act_by_p)):
        plan_sum = plan_by_p.get(p, 0.0)
        act_sum = act_by_p.get(p, 0.0)
        if plan_sum <= 0:
            if act_sum > 0:
                skipped.append({"kode_pabrik": p, "reason": "tanpa rencana (Σ lhp_est = 0)"})
            else:
                skipped.append({"kode_pabrik": p, "reason": "tanpa data"})
            continue
        pts = []
        cum_e = cum_a = 0.0
        for d in sorted(est_dates_by_p.get(p, set()) | act_dates_by_p.get(p, set())):
            cum_e += est.get((p, d), 0.0)
            cum_a += act.get((p, d), 0.0)
            if cum_e > 0:
                pts.append([d, cum_a / cum_e])
        vals = [x[1] for x in pts] or [act_sum / plan_sum]
        plants.append({"kode_pabrik": p, "points": pts,
                       "avg": sum(vals) / len(vals), "min": min(vals),
                       "max": max(vals), "last": vals[-1], "n": len(pts),
                       "plan": plan_sum, "actual": act_sum,
                       "pct": act_sum / plan_sum})
        b = pmap.get(p)
        if b:
            acc = bus_acc.setdefault(b, {"plan": 0.0, "actual": 0.0, "ed": {}, "ad": {}})
            acc["plan"] += plan_sum
            acc["actual"] += act_sum
            for d in est_dates_by_p.get(p, set()):
                acc["ed"][d] = acc["ed"].get(d, 0.0) + est.get((p, d), 0.0)
            for d in act_dates_by_p.get(p, set()):
                acc["ad"][d] = acc["ad"].get(d, 0.0) + act.get((p, d), 0.0)

    bus = []
    for b in sorted(bus_acc):
        acc = bus_acc[b]
        if acc["plan"] <= 0:
            continue
        pts_b = []
        cum_be = cum_ba = 0.0
        for d in sorted(set(acc["ed"]) | set(acc["ad"])):
            cum_be += acc["ed"].get(d, 0.0)
            cum_ba += acc["ad"].get(d, 0.0)
            if cum_be > 0:
                pts_b.append([d, cum_ba / cum_be])
        vals_b = [x[1] for x in pts_b] or [acc["actual"] / acc["plan"]]
        bus.append({"bu": b, "points": pts_b,
                    "avg": sum(vals_b) / len(vals_b), "min": min(vals_b),
                    "max": max(vals_b), "last": vals_b[-1], "n": len(pts_b),
                    "plan": acc["plan"], "actual": acc["actual"],
                    "pct": acc["actual"] / acc["plan"]})

    total_plan = sum(p["plan"] for p in plants)
    total_actual = sum(p["actual"] for p in plants)
    last_actual = max((d for (p, d) in act), default=None)
    return {
        "plants": plants, "bus": bus, "skipped": skipped,
        "total_plan": total_plan, "total_actual": total_actual,
        "total_pct": (total_actual / total_plan) if total_plan > 0 else None,
        "last_actual": last_actual,
    }
