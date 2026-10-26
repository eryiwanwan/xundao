#!/usr/bin/env python3
"""批量收集 opengameart 候选素材详情，落盘 scripts/_oga_pool.json"""
import json, os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
import oga_pick as o

QUERIES_M = [
    "melancholy piano", "sad piano", "emotional piano", "snow", "cold night",
    "suspense", "tension", "dark ambient", "mystery", "rain piano",
    "night ambient", "hope piano", "forgotten", "empty room", "snowfall",
]
QUERIES_S = ["door creak", "door close", "footsteps snow", "paper rustle",
             "paper", "footsteps", "door", "breath"]

pool, seen = [], set()


def grab(item):
    kind, keys = item
    try:
        urls = o.search(keys, kind)
    except Exception as e:
        return []
    out = []
    for u in urls[:8]:
        if u in seen:
            continue
        seen.add(u)
        try:
            d = o.detail(u)
        except Exception:
            continue
        d["kind"] = kind
        d["q"] = keys
        if d["files"]:
            out.append(d)
    return out


jobs = [("music", q) for q in QUERIES_M] + [("sfx", q) for q in QUERIES_S]
with cf.ThreadPoolExecutor(max_workers=6) as ex:
    for res in ex.map(grab, jobs):
        pool.extend(res)

json.dump(pool, open(os.path.join(os.path.dirname(__file__), "_oga_pool.json"), "w"),
          ensure_ascii=False, indent=1)
print("total", len(pool))
