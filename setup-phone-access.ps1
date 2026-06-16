# 핸드폰 접속 설정 스크립트 (PowerShell 관리자 권한으로 실행)
# 사용법: 관리자 PowerShell에서 실행

$WSL_IP = "172.22.231.154"
$PORT = 5173

Write-Host "WSL2 포트 포워딩 설정 중..." -ForegroundColor Cyan

# 기존 규칙 제거
netsh interface portproxy delete v4tov4 listenport=$PORT listenaddress=0.0.0.0 2>$null

# 포트 포워딩 추가 (WSL2 → Windows)
netsh interface portproxy add v4tov4 listenport=$PORT listenaddress=0.0.0.0 connectport=$PORT connectaddress=$WSL_IP

# 방화벽 규칙 추가
netsh advfirewall firewall delete rule name="Seenit Dev" 2>$null
netsh advfirewall firewall add rule name="Seenit Dev" dir=in action=allow protocol=TCP localport=$PORT

# 현재 Windows IP 확인
$WIN_IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "172.*" } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "설정 완료!" -ForegroundColor Green
Write-Host "핸드폰에서 접속 주소: http://$WIN_IP`:$PORT" -ForegroundColor Yellow
Write-Host "(같은 WiFi에 연결되어 있어야 합니다)" -ForegroundColor Gray
