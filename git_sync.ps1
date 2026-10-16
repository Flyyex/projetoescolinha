# Sincroniza com o repositorio remoto de forma segura.
#   .\git_sync.ps1            -> busca, roda os testes, sobe
#   .\git_sync.ps1 -SoEntrar  -> so atualiza (fetch+merge), nao envia
#
# USE SEMPRE antes de comecar a trabalhar e de novo antes de terminar.
# Se alguem ja enviou coisa nova, o merge e automatico e os testes rodam antes.

param([switch]$SoEntrar)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

function Title($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Title "1. Salvando seu trabalho"
$dirty = git status --porcelain 2>$null | Where-Object { $_ -notmatch '^\?\? tmp_diag' }
if ($dirty) {
  Write-Host "Alteracoes nao commitadas:" -ForegroundColor Yellow
  $dirty | ForEach-Object { Write-Host "  $_" }
  Write-Host ""
  $op = $null
  try { $op = Read-Host "Fazer commit agora? (1) sim   (2) guardar com stash" } catch { $op = $null }
  if ($op -eq '1') {
    git add -A -- ':!tmp_diag.ps1'
    git commit -m "wip: progresso local"
    Write-Host "commit criado" -ForegroundColor Green
  } elseif ($op -eq '2') {
    git stash push -u -m "wip antes do sync"
    Write-Host "guardado no stash" -ForegroundColor Yellow
  } else {
    Write-Host "Sem commit. Se tinha trabalho seu, faca commit antes de continuar." -ForegroundColor Yellow
  }
} else {
  Write-Host "tudo limpo"
}

Title "2. Buscando novidade"
git fetch origin 2>&1 | Out-Null
$atras = [int](git rev-list --count HEAD..origin/main)
Write-Host "commits novos no remoto: $atras"

if ($atras -gt 0) {
  Title "3. O que o outro enviou"
  git log --oneline HEAD..origin/main
  Write-Host ""
  Write-Host "Integrando..." -ForegroundColor Cyan
  git merge origin/main --no-edit 2>&1 | Select-String -Pattern "CONFLICT|Merge" | ForEach-Object { Write-Host "  $_" }
  $conflitos = @(git diff --name-only --diff-filter=U)
  if ($conflitos.Count -gt 0) {
    Write-Host "MERGE COM CONFLITO - resolva na mao:" -ForegroundColor Red
    $conflitos | ForEach-Object { Write-Host "  $_" }
    exit 1
  }
}

Title "4. Rodando os testes"
$falhou = $false
if (Test-Path "tests/limits.test.js") {
  $out = node tests/limits.test.js 2>&1
  $out | Select-String -Pattern "pass|fail" | ForEach-Object { Write-Host "  $_" }
  if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host "  testes FALHARAM" -ForegroundColor Red }
}
foreach ($f in (git diff --name-only HEAD~1 HEAD 2>$null | Where-Object { $_ -like "*.js" -and (Test-Path $_) })) {
  node --check $f 2>$null
  if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host "  SINTAXE: $f" -ForegroundColor Red }
}
if ($falhou) {
  Write-Host ""
  Write-Host "TESTES QUEBRADOS. Nao subindo. Arrume antes." -ForegroundColor Red
  exit 1
}
Write-Host "  tudo verde" -ForegroundColor Green

if ($SoEntrar) {
  Title "So sincronizei (nada foi enviado)"
  Write-Host "pronto para trabalhar." -ForegroundColor Green
  exit 0
}

Title "5. Enviando"
git push origin main 2>&1 | Select-String -Pattern "main ->|rejected" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) {
  Write-Host "Alguem enviou entre o merge e agora. Rode o script de novo." -ForegroundColor Yellow
  exit 1
}
Title "Sincronizado"
Write-Host "Voce esta em dia com o repositorio." -ForegroundColor Green
Write-Host "LEMBRETE: rode .\git_sync.ps1 antes de comecar a trabalhar."
