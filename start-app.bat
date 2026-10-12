@echo off
chcp 65001 > nul
echo ===================================================================
echo [KiwoomAutoTrader v1.0] 국내 주식 독립형 자동매매 시스템 시작
echo 모드: 키움증권 REST API 모의매매 (실계좌 주문 원천 차단)
echo ===================================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo Node.js v20 이상을 설치한 후 다시 실행하십시오.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] 종속성 패키지를 설치합니다...
    call npm install
)

echo [INFO] 자동매매 서버 및 대시보드를 시작합니다 (포트 3000)...
start http://localhost:3000
call npm run dev

pause
