#!/usr/bin/env python3
"""
Situational Awareness LP (Leopold Aschenbrenner) 13F 포트폴리오 데이터 수집 스크립트.

13f.info 에서 최신 13F 공시를 찾아 보유 종목을 가져와 data/portfolio.json 으로 저장한다.
매일 아침 자동으로 실행되어 최신 공시를 반영한다.
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

MANAGER_SLUG = "0002045724-situational-awareness-lp"
MANAGER_URL = f"https://13f.info/manager/{MANAGER_SLUG}"
BASE = "https://13f.info"
OUT = Path(__file__).parent / "data" / "portfolio.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "text/html,application/json",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def find_latest_filing():
    """매니저 페이지에서 가장 최근 13F 공시의 id / 분기 / 제출일을 찾는다."""
    html = fetch(MANAGER_URL)
    # 각 공시 행: /13f/<id>-situational-awareness-lp-<quarter>  형태의 링크
    rows = re.findall(
        r'href="(/13f/(\d+)-situational-awareness-lp-([a-z0-9-]+))"', html
    )
    if not rows:
        raise RuntimeError("매니저 페이지에서 13F 공시를 찾지 못했습니다.")
    # 페이지 상단(=최신)이 첫 번째 항목
    href, filing_id, quarter_slug = rows[0]
    return filing_id, quarter_slug.replace("-", " ").upper()


def fetch_holdings(filing_id: str):
    """공시 id 의 보유 종목 JSON 을 가져온다."""
    data = json.loads(fetch(f"{BASE}/data/13f/{filing_id}"))
    return data["data"]


# 13f.info data 컬럼:
# [Sym, Issuer, Class, CUSIP, Value($000), %, Shares, Principal, OptionType]
POSITION_LABEL = {
    None: "주식",       # long stock
    "call": "콜옵션",   # bullish option
    "put": "풋옵션",    # bearish option
}


def build_payload(filing_id: str, quarter: str, rows):
    holdings = []
    total_value = 0
    for r in rows:
        sym, issuer, cls, cusip, value, pct, shares, principal, opt = (
            r + [None] * (9 - len(r))
        )[:9]
        value = value or 0
        total_value += value
        holdings.append(
            {
                "ticker": sym or "—",
                "name": issuer.title() if issuer else "(미상)",
                "class": cls,
                "value": value,  # 단위: 천 달러
                "shares": shares,
                "position": opt,  # None / "call" / "put"
                "positionLabel": POSITION_LABEL.get(opt, "주식"),
            }
        )

    # 13F 가 보고한 가치 기준으로 비율 재계산
    for h in holdings:
        h["pct"] = round(h["value"] / total_value * 100, 2) if total_value else 0

    # 비율 오름차순 정렬 (요청사항)
    holdings.sort(key=lambda h: h["pct"])

    return {
        "fund": "Situational Awareness LP",
        "manager": "Leopold Aschenbrenner",
        "quarter": quarter,
        "filingId": filing_id,
        "sourceUrl": f"{BASE}/13f/{filing_id}",
        "totalValueUsd": total_value * 1000,  # 천 달러 -> 달러
        "holdingsCount": len(holdings),
        "holdings": holdings,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def main():
    filing_id, quarter = find_latest_filing()
    rows = fetch_holdings(filing_id)
    payload = build_payload(filing_id, quarter, rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"저장 완료: {OUT}\n"
        f"  공시: {quarter} (id={filing_id})\n"
        f"  보유 종목: {payload['holdingsCount']}개\n"
        f"  총 가치: ${payload['totalValueUsd']:,}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"업데이트 실패: {e}", file=sys.stderr)
        sys.exit(1)
