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
CIK = "0002045724"
SEC_SUBMISSIONS = f"https://data.sec.gov/submissions/CIK{CIK}.json"
OUT = Path(__file__).parent / "data" / "portfolio.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept": "text/html,application/json",
}
# SEC 는 연락처가 포함된 User-Agent 를 요구한다.
SEC_HEADERS = {
    "User-Agent": "leopold-13f portfolio site (sangheon369@gmail.com)",
    "Accept": "application/json,application/xml",
}

# 13G/13D 공시에서 ticker 를 알아내기 위한 CUSIP -> 티커 매핑 (알려진 것만)
CUSIP_TICKER = {
    "N97284108": "NBIS",  # Nebius Group N.V.
}


def fetch(url: str, headers=HEADERS) -> str:
    req = urllib.request.Request(url, headers=headers)
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


def _xml_val(xml: str, tag: str):
    m = re.search(rf"<[a-zA-Z:]*{tag}[^>]*>([^<]+)</", xml, re.I)
    return m.group(1).strip() if m else None


def _xml_max_num(xml: str, *tags):
    vals = []
    for t in tags:
        for m in re.findall(rf"<[a-zA-Z:]*{t}[^>]*>([\d,\.]+)<", xml, re.I):
            try:
                vals.append(float(m.replace(",", "")))
            except ValueError:
                pass
    return max(vals) if vals else None


def fetch_disclosures(latest_13f_date: str):
    """
    SEC EDGAR 에서 최신 13F 이후에 제출된 13G/13D(지분 5% 이상) 공시를 가져온다.
    13F 는 분기말 스냅샷이라, 분기 중간에 새로 산 종목(예: Nebius)은 이렇게만 드러난다.
    """
    try:
        sub = json.loads(fetch(SEC_SUBMISSIONS, headers=SEC_HEADERS))
    except Exception as e:  # noqa: BLE001
        print(f"  (SEC 공시 조회 실패, 건너뜀: {e})", file=sys.stderr)
        return []

    r = sub["filings"]["recent"]
    out = []
    seen = set()
    for form, filed, acc, doc in zip(
        r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"]
    ):
        if "13G" not in form and "13D" not in form:
            continue
        if filed <= latest_13f_date:  # 13F 에 이미 반영된 시점이면 제외
            continue
        acc_nodash = acc.replace("-", "")
        xml_url = (
            f"https://www.sec.gov/Archives/edgar/data/{int(CIK)}/{acc_nodash}/primary_doc.xml"
        )
        try:
            xml = fetch(xml_url, headers=SEC_HEADERS)
        except Exception:  # noqa: BLE001
            continue
        issuer = _xml_val(xml, "issuerName")
        if not issuer or issuer in seen:
            continue
        seen.add(issuer)
        cusip = _xml_val(xml, "issuerCusipNumber") or _xml_val(xml, "cusip")
        shares = _xml_max_num(
            xml, "sharedVotingPower", "soleVotingPower",
            "sharedDispositivePower", "soleDispositivePower",
        )
        percent = _xml_val(xml, "classPercent") or _xml_val(xml, "percentOfClass")
        out.append(
            {
                "form": form,
                "issuer": issuer,
                "ticker": CUSIP_TICKER.get((cusip or "").upper()),
                "cusip": cusip,
                "classTitle": _xml_val(xml, "securitiesClassTitle"),
                "shares": int(shares) if shares else None,
                "percentOfCompany": float(percent) if percent else None,
                "eventDate": _xml_val(xml, "eventDateRequiresFilingThisStatement"),
                "filedDate": filed,
                "url": f"https://www.sec.gov/Archives/edgar/data/{int(CIK)}/{acc_nodash}/",
            }
        )
    return out


def build_payload(filing_id: str, quarter: str, rows, disclosures):
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
        "recentDisclosures": disclosures,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def latest_13f_filed_date():
    """매니저 페이지 첫 행의 제출일을 가져온다 (분기 외 공시 필터 기준)."""
    html = fetch(MANAGER_URL)
    m = re.search(r"(\d{1,2}/\d{1,2}/\d{4})", html)
    if not m:
        return "1970-01-01"
    mm, dd, yy = m.group(1).split("/")
    return f"{yy}-{int(mm):02d}-{int(dd):02d}"


def main():
    filing_id, quarter = find_latest_filing()
    rows = fetch_holdings(filing_id)
    disclosures = fetch_disclosures(latest_13f_filed_date())
    payload = build_payload(filing_id, quarter, rows, disclosures)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"저장 완료: {OUT}\n"
        f"  공시: {quarter} (id={filing_id})\n"
        f"  보유 종목: {payload['holdingsCount']}개\n"
        f"  총 가치: ${payload['totalValueUsd']:,}\n"
        f"  분기 외 지분 공시: {len(disclosures)}건"
        + (
            " -> " + ", ".join(f"{d['issuer']}({d.get('percentOfCompany')}%)" for d in disclosures)
            if disclosures else ""
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"업데이트 실패: {e}", file=sys.stderr)
        sys.exit(1)
