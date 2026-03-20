<#
.SYNOPSIS
    Syncs skills from the global my-agent-skills repo to this project.
    Reads .skills-config.json and copies SKILL.md files to .claude/commands/.

.DESCRIPTION
    Source of truth: ../agentskills/my-agent-skills/
    Target: .claude/commands/ (Claude Code slash commands)

    This script ensures .claude/commands/ stays in sync with the global repo.
    Never edit .claude/commands/ directly — edit the SKILL.md in the global repo
    and re-run this script.

.EXAMPLE
    .\scripts\sync-skills.ps1           # Normal sync
    .\scripts\sync-skills.ps1 -DryRun   # Preview changes without writing
    .\scripts\sync-skills.ps1 -Verbose  # Show detailed output
#>

param(
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# --- Resolve paths ---
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ConfigPath = Join-Path $ProjectRoot ".skills-config.json"

if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config not found: $ConfigPath"
    exit 1
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$GlobalRepo = Join-Path $ProjectRoot $Config.globalSkillsRepo

if (-not (Test-Path $GlobalRepo)) {
    Write-Error "Global skills repo not found: $GlobalRepo`nExpected at: $($Config.globalSkillsRepo) relative to project root."
    exit 1
}

$TargetDir = Join-Path $ProjectRoot $Config.autoSync.target
$Header = $Config.autoSync.header

Write-Host "`n=== Skills Sync ===" -ForegroundColor Cyan
Write-Host "Global repo : $GlobalRepo"
Write-Host "Target      : $TargetDir"
if ($DryRun) { Write-Host "[DRY RUN] No files will be modified.`n" -ForegroundColor Yellow }

# --- Ensure target directory exists ---
if (-not (Test-Path $TargetDir)) {
    if (-not $DryRun) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }
    Write-Host "Created: $TargetDir" -ForegroundColor Green
}

$synced = 0
$skipped = 0
$errors = 0

# --- Sync command skills (SKILL.md -> .claude/commands/{name}.md) ---
Write-Host "`n--- Command Skills ---" -ForegroundColor Cyan

foreach ($skill in $Config.skills.commands) {
    $sourcePath = Join-Path $GlobalRepo $skill.source
    $targetPath = Join-Path $TargetDir "$($skill.name).md"

    if (-not (Test-Path $sourcePath)) {
        Write-Host "  MISSING: $($skill.name) <- $sourcePath" -ForegroundColor Red
        $errors++
        continue
    }

    $sourceContent = Get-Content $sourcePath -Raw

    # Check if target is up-to-date
    if ((Test-Path $targetPath) -and -not $Force) {
        $targetContent = Get-Content $targetPath -Raw
        if ($sourceContent -eq $targetContent) {
            Write-Host "  UP-TO-DATE: $($skill.name)" -ForegroundColor DarkGray
            $skipped++
            continue
        }
    }

    if (-not $DryRun) {
        $sourceContent | Set-Content -Path $targetPath -NoNewline -Encoding UTF8
    }
    Write-Host "  SYNCED: $($skill.name) [$($skill.scope)]" -ForegroundColor Green
    $synced++
}

# --- Sync agent skills (directories -> .agents/skills/) ---
Write-Host "`n--- Agent Skills ---" -ForegroundColor Cyan

foreach ($skill in $Config.skills.agents) {
    $sourcePath = Join-Path $GlobalRepo $skill.source
    $targetPath = Join-Path $ProjectRoot $skill.target

    if (-not (Test-Path $sourcePath)) {
        Write-Host "  MISSING: $($skill.name) <- $sourcePath" -ForegroundColor Red
        $errors++
        continue
    }

    if (-not $DryRun) {
        if (Test-Path $targetPath) {
            Remove-Item -Recurse -Force $targetPath
        }
        Copy-Item -Recurse -Force $sourcePath $targetPath
    }
    Write-Host "  SYNCED: $($skill.name) [$($skill.scope)]" -ForegroundColor Green
    $synced++
}

# --- Clean retired skills ---
Write-Host "`n--- Retired Skills ---" -ForegroundColor Cyan

foreach ($retired in $Config.retired) {
    $retiredPath = Join-Path $TargetDir "$($retired.name).md"
    if (Test-Path $retiredPath) {
        if (-not $DryRun) {
            Remove-Item $retiredPath
        }
        Write-Host "  REMOVED: $($retired.name) (replaced by: $($retired.replacedBy))" -ForegroundColor Yellow
    } else {
        Write-Host "  ALREADY GONE: $($retired.name)" -ForegroundColor DarkGray
    }
}

# --- Summary ---
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "  Synced : $synced"
Write-Host "  Skipped: $skipped (up-to-date)"
Write-Host "  Errors : $errors"

if ($errors -gt 0) {
    Write-Host "`nSome skills failed to sync. Check paths above." -ForegroundColor Red
    exit 1
}

if ($DryRun) {
    Write-Host "`n[DRY RUN] Re-run without -DryRun to apply changes." -ForegroundColor Yellow
}

Write-Host ""
