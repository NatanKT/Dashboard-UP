import configparser
import os
import threading
import time
from datetime import date, datetime

import pymysql

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.ini")

EST_TABLE = "query_cpu_upa_2026"
ACT_TABLE = "query_lhp_upa_2026"
OEE_TABLE = "query_oee_upa_2026"

QUERY_TTL = 60

_cache = {}
_cache_lock = threading.Lock()


def load_config():
    cfg = configparser.ConfigParser()
    if not cfg.read(CONFIG_PATH, encoding="utf-8"):
        raise RuntimeError("config.ini tidak ditemukan: " + CONFIG_PATH)
    if "database" not in cfg:
        raise RuntimeError("Section [database] tidak ada di config.ini")
    s = cfg["database"]
    return {
        "host": s.get("host", fallback=""),
        "port": s.getint("port", fallback=3306),
        "user": s.get("user", fallback=""),
        "password": s.get("password", fallback=""),
        "database": s.get("name", fallback=""),
    }


def connect():
    c = load_config()
    return pymysql.connect(
        host=c["host"], port=c["port"], user=c["user"], password=c["password"],
        database=c["database"], charset="utf8mb4",
        connect_timeout=8, read_timeout=120, write_timeout=120,
    )


def _s(v):
    return "" if v is None else str(v).strip()


def _iso(v):
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def _cached_fetch(sql, params):
    key = (sql, tuple(params))
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[1] < QUERY_TTL:
            return hit[0]
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = [list(r) for r in cur.fetchall()]
    finally:
        conn.close()
    with _cache_lock:
        _cache[key] = (rows, now)
        while len(_cache) > 8:
            _cache.pop(next(iter(_cache)))
    return rows


def _date_where(date_from, date_to):
    conds, params = [], []
    if date_from:
        conds.append("`tanggal` >= %s")
        params.append(date_from)
    if date_to:
        conds.append("`tanggal` <= %s")
        params.append(date_to)
    where = (" WHERE " + " AND ".join(conds)) if conds else ""
    return where, params


def fetch_dates():
    sql_e = "SELECT DISTINCT `tanggal` FROM `" + EST_TABLE + "`"
    sql_a = "SELECT DISTINCT `tanggal` FROM `" + ACT_TABLE + "`"
    rows_e = _cached_fetch(sql_e, ())
    rows_a = _cached_fetch(sql_a, ())
    dates = set()
    for r in rows_e + rows_a:
        d = _iso(r[0])
        if d:
            dates.add(d)
    return sorted(dates)


def fetch_plan_rows(date_from, date_to):
    where, params = _date_where(date_from, date_to)
    sql_e = ("SELECT `bu`, `kode_pabrik`, `line`, `tanggal`, `lhp_est`, `lhp_real`"
             " FROM `" + EST_TABLE + "`" + where)
    sql_a = ("SELECT `bu`, `kode_pabrik`, `tanggal`, `real_ctn`"
             " FROM `" + ACT_TABLE + "`" + where)
    rows_e = _cached_fetch(sql_e, params)
    rows_a = _cached_fetch(sql_a, params)
    est = [{"bu": _s(r[0]), "kode_pabrik": _s(r[1]), "line": _s(r[2]),
            "tanggal": _iso(r[3]), "lhp_est": r[4], "lhp_real": r[5]}
           for r in rows_e]
    act = [{"bu": _s(r[0]), "kode_pabrik": _s(r[1]),
            "tanggal": _iso(r[2]), "real_ctn": r[3]}
           for r in rows_a]
    return est, act


def fetch_oee_rows(date_from, date_to):
    where, params = _date_where(date_from, date_to)
    sql = ("SELECT `bu`, `tanggal`, `at`, `mpt`, `ao`, `so`, `go`, `target_c_bu`"
           " FROM `" + OEE_TABLE + "`" + where)
    rows = _cached_fetch(sql, params)
    return [{"bu": _s(r[0]), "tanggal": _iso(r[1]), "at": r[2], "mpt": r[3],
             "ao": r[4], "so": r[5], "go": r[6], "target": r[7]}
            for r in rows]
