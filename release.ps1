<#
  release.ps1 — выпуск версии ca2026 одним запуском (Windows PowerShell 5.1).

  Порядок (как в RELEASE.md):
    проверки -> npm run release (сборка + синхронизация dist/ в ../kypaku.github.io/pages/ca2026)
    -> подтверждение -> git tag -a v<Version> -> git push origin master -> git push origin v<Version>
    -> коммит и push репо сайта.

  Запуск:
    powershell -ExecutionPolicy Bypass -File .\release.ps1            # выпуск версии из package.json
    powershell -ExecutionPolicy Bypass -File .\release.ps1 -DryRun    # только проверки и печать команд
    powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 0.2.0

  -DryRun ничего не пишет, не тегает и не пушит: выполняет только проверки
  (git status, npm run type-check, npm test, npm run release -- --dry-run) и печатает остальные команды.
#>
param(
  [string]$Version = '',
  [switch]$DryRun
)

$repo = $PSScriptRoot
$site = Join-Path (Split-Path $repo -Parent) 'kypaku.github.io'
$siteFolder = 'pages/ca2026'
$liveUrl = 'https://kypaku.github.io/pages/ca2026/'
$ciUrl = 'https://github.com/Kypaku/ca2026/actions'
$total = 14

function Fail([string]$message) {
  Write-Host ''
  Write-Host "ОШИБКА: $message" -ForegroundColor Red
  Write-Host 'Выпуск остановлен.' -ForegroundColor Red
  exit 1
}

function Step([int]$n, [string]$title) {
  Write-Host ''
  Write-Host "[$n/$total] $title" -ForegroundColor Cyan
}

function Show-Cmd([string]$cmd) {
  Write-Host "  > $cmd" -ForegroundColor DarkGray
}

# Запускает команду, если не DryRun; в DryRun только печатает её.
function Run-Write([string]$cmd, [scriptblock]$action, [string]$failMessage) {
  if ($DryRun) {
    Write-Host "  (DryRun, не выполняется) $cmd" -ForegroundColor Yellow
    return
  }
  Show-Cmd $cmd
  $global:LASTEXITCODE = 0
  & $action
  if ($LASTEXITCODE -ne 0) { Fail "$failMessage (код выхода $LASTEXITCODE)" }
}

# Запускает проверку (выполняется и в DryRun).
function Run-Check([string]$cmd, [scriptblock]$action, [string]$failMessage) {
  Show-Cmd $cmd
  $global:LASTEXITCODE = 0
  & $action
  if ($LASTEXITCODE -ne 0) { Fail "$failMessage (код выхода $LASTEXITCODE)" }
}

# Список изменений в рабочем дереве (без записи в .git/index).
function Get-Dirty([string]$dir) {
  $global:LASTEXITCODE = 0
  $lines = @(git -C $dir --no-optional-locks status --porcelain)
  if ($LASTEXITCODE -ne 0) { Fail "git status не сработал в $dir" }
  return @($lines | Where-Object { $_ -ne '' -and $_ -ne $null })
}

Set-Location $repo
if ($DryRun) {
  Write-Host 'Режим DryRun: только проверки, ничего не пишется, не тегается и не пушится.' -ForegroundColor Yellow
}

# --- 1. Ветка и чистота ca2026 ---
Step 1 'Проверяю ветку и чистоту рабочего дерева ca2026'
$global:LASTEXITCODE = 0
$branch = (git -C $repo rev-parse --abbrev-ref HEAD)
if ($LASTEXITCODE -ne 0) { Fail "не удалось узнать ветку в $repo (это git-репозиторий?)" }
if ($branch -ne 'master') { Fail "текущая ветка '$branch', а выпускать нужно с master: git checkout master" }
$dirty = Get-Dirty $repo
if ($dirty.Count -gt 0) {
  $dirty | ForEach-Object { Write-Host "  $_" }
  Fail 'в ca2026 есть незакоммиченные изменения (список выше). Закоммитьте или уберите их.'
}
Write-Host "  ветка master, дерево чистое ($(git -C $repo log -1 --format='%h %s'))"

# --- 2. Версия ---
Step 2 'Проверяю версию (package.json, CHANGELOG.md)'
try {
  $pkg = Get-Content (Join-Path $repo 'package.json') -Raw -ErrorAction Stop | ConvertFrom-Json
} catch {
  Fail "не удалось прочитать package.json: $($_.Exception.Message)"
}
$pkgVersion = [string]$pkg.version
if ($Version -eq '') { $Version = $pkgVersion }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "версия '$Version' не в формате x.y.z" }
if ($Version -ne $pkgVersion) {
  Fail "в package.json версия $pkgVersion, а выпускается $Version. Сначала: npm version $Version --no-git-tag-version, закоммитьте."
}
$tag = "v$Version"
$changelog = Join-Path $repo 'CHANGELOG.md'
if (-not (Test-Path $changelog)) { Fail 'нет CHANGELOG.md' }
$section = Select-String -Path $changelog -Pattern ('^## ' + [regex]::Escape($Version) + '(\s|$)') -Encoding UTF8
if (-not $section) { Fail "в CHANGELOG.md нет раздела '## $Version — <дата>'" }
if (Select-String -Path $changelog -Pattern '^## Unreleased' -Encoding UTF8) {
  Write-Host '  ВНИМАНИЕ: в CHANGELOG.md есть раздел ## Unreleased — проверьте, что в нём ничего не осталось.' -ForegroundColor Yellow
}
Write-Host "  версия $Version, тег $tag"

# --- 3. Тег ---
Step 3 "Проверяю, что тега $tag ещё нет"
$global:LASTEXITCODE = 0
$localTag = @(git -C $repo tag -l $tag)
if ($LASTEXITCODE -ne 0) { Fail 'git tag -l не сработал' }
if (($localTag | Where-Object { $_ -eq $tag }).Count -gt 0) {
  Fail "тег $tag уже есть локально. Если он ошибочный: git tag -d $tag (и проверьте, нет ли его на GitHub)."
}
$global:LASTEXITCODE = 0
$remoteTag = @(git -C $repo ls-remote --tags origin "refs/tags/$tag")
if ($LASTEXITCODE -ne 0) {
  Write-Host '  ВНИМАНИЕ: не удалось спросить origin о тегах (нет сети?). Проверено только локально.' -ForegroundColor Yellow
} elseif (($remoteTag | Where-Object { $_ -ne '' }).Count -gt 0) {
  Fail "тег $tag уже есть на origin (GitHub). Выпустите другую версию."
} else {
  Write-Host "  тега $tag нет ни локально, ни на origin"
}

# --- 4. Репо сайта ---
Step 4 "Проверяю репо сайта $site"
if (-not (Test-Path (Join-Path $site '.git'))) { Fail "репо сайта не найдено: $site (оно должно лежать рядом с ca2026)" }
$siteDirty = Get-Dirty $site
if ($siteDirty.Count -gt 0) {
  $siteDirty | ForEach-Object { Write-Host "  $_" }
  Fail 'в репо сайта есть незакоммиченные изменения (список выше). Разберитесь с ними до выпуска.'
}
$global:LASTEXITCODE = 0
$siteBranch = (git -C $site rev-parse --abbrev-ref HEAD)
$siteUpstream = (git -C $site rev-parse --abbrev-ref '@{u}')
if ($LASTEXITCODE -ne 0) { Fail "у ветки '$siteBranch' репо сайта нет upstream — git push не будет знать, куда пушить" }
Write-Host "  чистое, ветка $siteBranch -> $siteUpstream"

# --- 5. type-check ---
Step 5 'Проверка типов (npm run type-check)'
Run-Check 'npm run type-check' { npm.cmd run type-check } 'npm run type-check нашёл ошибки типов'

# --- 6. tests ---
Step 6 'Тесты (npm test)'
Run-Check 'npm test' { npm.cmd test } 'тесты не прошли'

# --- 7. build + sync ---
Step 7 "Сборка и синхронизация dist/ в $siteFolder (npm run release)"
if ($DryRun) {
  if (Test-Path (Join-Path $repo 'dist\index.html')) {
    Run-Check 'npm run release -- --dry-run' { npm.cmd run release -- --dry-run } 'npm run release -- --dry-run завершился с ошибкой'
    Write-Host '  (список выше — по старой dist/; настоящий запуск сначала пересоберёт)' -ForegroundColor DarkGray
  } else {
    Write-Host '  dist/ ещё нет — сравнение пропущено' -ForegroundColor DarkGray
  }
}
Run-Write 'npm run release' { npm.cmd run release } 'npm run release (сборка или копирование в сайт) не удался'

# --- 8. ca2026 после сборки ---
Step 8 'Проверяю, что сборка не оставила изменений в ca2026'
if ($DryRun) {
  Write-Host '  (DryRun, не выполняется) сборка вне DryRun может обновить tsconfig.*.tsbuildinfo — они будут возвращены через git checkout' -ForegroundColor Yellow
} else {
  $after = Get-Dirty $repo
  $buildInfo = @($after | Where-Object { $_ -match 'tsconfig\.[a-z]+\.tsbuildinfo$' })
  if ($buildInfo.Count -gt 0) {
    Show-Cmd 'git checkout -- tsconfig.app.tsbuildinfo tsconfig.node.tsbuildinfo'
    git -C $repo checkout -- tsconfig.app.tsbuildinfo tsconfig.node.tsbuildinfo
    if ($LASTEXITCODE -ne 0) { Fail 'не удалось вернуть tsconfig.*.tsbuildinfo' }
  }
  $after = Get-Dirty $repo
  if ($after.Count -gt 0) {
    $after | ForEach-Object { Write-Host "  $_" }
    Fail 'после сборки в ca2026 появились изменения (список выше). Сайт уже обновлён, но ничего не тегнуто и не запушено.'
  }
  Write-Host '  ca2026 чистое'
}

# --- 9. подтверждение ---
Step 9 'Подтверждение'
$siteChanges = @()
if (-not $DryRun) {
  $siteChanges = Get-Dirty $site
  Write-Host "  изменения в репо сайта ($($siteChanges.Count)):"
  $siteChanges | ForEach-Object { Write-Host "    $_" }
  $outside = @($siteChanges | Where-Object { $_.Substring(3).Trim('"') -notlike "$siteFolder/*" })
  if ($outside.Count -gt 0) { Fail "в репо сайта изменено что-то вне $siteFolder — проверьте вручную, ничего не запушено." }
}
Write-Host "  будет: тег $tag, git push origin master, git push origin $tag, коммит и push репо сайта"
if ($DryRun) {
  Write-Host "  (DryRun, не выполняется) вопрос: Выпустить ${tag}? (да/нет)" -ForegroundColor Yellow
} else {
  $answer = Read-Host "Выпустить ${tag}? (да/нет)"
  $answer = ([string]$answer).Trim().ToLower()
  if (@('да', 'д', 'yes', 'y') -notcontains $answer) {
    Write-Host ''
    Write-Host 'Отменено. Тег не создан, ничего не запушено.' -ForegroundColor Yellow
    Write-Host "Папка $siteFolder в репо сайта уже обновлена сборкой. Откатить: git -C `"$site`" checkout -- $siteFolder; git -C `"$site`" clean -fd -- $siteFolder"
    exit 1
  }
}

# --- 10. тег ---
Step 10 "Создаю тег $tag"
Run-Write "git tag -a $tag -m `"ca2026 $tag`"" { git -C $repo tag -a $tag -m "ca2026 $tag" } "не удалось создать тег $tag"

# --- 11. push master ---
Step 11 'Push master'
Run-Write 'git push origin master' { git -C $repo push origin master } "git push origin master не удался. Тег $tag создан локально; после исправления: git push origin master; git push origin $tag"

# --- 12. push tag ---
Step 12 "Push тега $tag"
Run-Write "git push origin $tag" { git -C $repo push origin $tag } "git push origin $tag не удался. Повторите: git push origin $tag"

# --- 13. коммит сайта ---
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$siteMsg = "ca2026: publish build $tag $stamp"
Step 13 'Коммит репо сайта'
if ((-not $DryRun) -and $siteChanges.Count -eq 0) {
  Write-Host '  сборка не изменила сайт — коммитить нечего'
} else {
  Run-Write "git -C `"$site`" add -A -- $siteFolder" { git -C $site add -A -- $siteFolder } 'git add в репо сайта не удался'
  Run-Write "git -C `"$site`" commit -m `"$siteMsg`"" { git -C $site commit -m $siteMsg } 'коммит в репо сайта не удался'
}

# --- 14. push сайта ---
Step 14 'Push репо сайта'
if ((-not $DryRun) -and $siteChanges.Count -eq 0) {
  Write-Host '  пропущено — нечего пушить'
} else {
  Run-Write "git -C `"$site`" push" { git -C $site push } "push репо сайта не удался. ca2026 и тег уже на GitHub; повторите: git -C `"$site`" push"
}

Write-Host ''
if ($DryRun) {
  Write-Host "DryRun: все проверки прошли. Для выпуска ${tag}: powershell -ExecutionPolicy Bypass -File .\release.ps1" -ForegroundColor Green
} else {
  Write-Host "Готово: $tag выпущен." -ForegroundColor Green
}
Write-Host "CI для тега:      $ciUrl"
Write-Host "Живая страница:   $liveUrl  (GitHub Pages обновляется 1-2 минуты)"
Write-Host 'Дальше: добавьте ## Unreleased в начало CHANGELOG.md.'
exit 0
