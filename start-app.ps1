# KiwoomAutoTrader v1.0 Windows PowerShell Launcher
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "[KiwoomAutoTrader v1.0] 국내 주식 독립형 자동매매 시스템 시작" -ForegroundColor Green
Write-Host "모드: 키움증권 REST API 모의매매 (실계좌 주문 원천 차단)" -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js가 설치되어 있지 않습니다. Node.js v20 이상을 설치해주세요." -ForegroundColor Red
    pause
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] 종속성 패키지를 설치합니다..." -ForegroundColor Gray
    npm install
}

Write-Host "[INFO] 브라우저 대시보드(http://localhost:3000)를 실행합니다..." -ForegroundColor Green
Start-Process "http://localhost:3000"

npm run dev
