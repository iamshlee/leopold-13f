# Leopold Aschenbrenner 13F 포트폴리오

[Leopold Aschenbrenner](https://en.wikipedia.org/wiki/Leopold_Aschenbrenner)가 운영하는 헤지펀드
**Situational Awareness LP**의 SEC 13F 공시를 기반으로 포트폴리오 보유 비중을 한눈에 보여주는 웹페이지입니다.

- 📊 보유 비중 도넛 차트 (상위 종목 + 기타)
- 📋 전체 보유 종목 표 — **비율 오름차순**
- 🕘 매일 오전 9시(KST) 최신 13F 공시 자동 반영
- 🔗 URL 하나로 누구나 열람 가능 (GitHub Pages)

## 구성

| 파일 | 설명 |
|------|------|
| `index.html` / `styles.css` / `app.js` | Toss 스타일 정적 웹페이지 |
| `data/portfolio.json` | 보유 종목 데이터 (자동 생성) |
| `update.py` | 13f.info에서 최신 13F를 가져와 `data/portfolio.json` 생성 |
| `.github/workflows/daily-update.yml` | 매일 자동 갱신 + GitHub Pages 배포 |

## 로컬에서 보기

```bash
python3 update.py          # 최신 데이터 가져오기 (선택)
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 열기
```
> `file://`로 직접 열면 데이터 fetch가 막히므로 반드시 http 서버로 실행하세요.

## 배포 (GitHub Pages) — 공개 URL 만들기

1. GitHub에 새 저장소를 만들고 이 폴더를 푸시합니다.
   ```bash
   git remote add origin https://github.com/<사용자명>/<저장소>.git
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
3. 푸시하면 자동 배포되고, 이후 **매일 오전 9시(KST)** 워크플로가 13F를 새로 받아 갱신·재배포합니다.
4. 공개 URL: `https://<사용자명>.github.io/<저장소>/`

## 데이터 출처

SEC EDGAR 13F-HR 공시 (집계: [13f.info](https://13f.info/manager/0002045724-situational-awareness-lp)).
본 페이지는 정보 제공용이며 투자 권유가 아닙니다.
