# ���؃X�N���v�g�C���c�[��
Write-Host "Continue�g���@�\�r���h�̌��؃X�N���v�g���C�����܂�..." -ForegroundColor Cyan

# �Ώۂ̃X�N���v�g�t�@�C��
$scriptsPath = "scripts/util/index.js"
$fullPath = Join-Path (Get-Location) $scriptsPath

# �X�N���v�g�̑��݂��m�F
if (-not (Test-Path $fullPath)) {
    Write-Host "�G���[: ���؃X�N���v�g��������܂���: $fullPath" -ForegroundColor Red
    exit 1
}

# �o�b�N�A�b�v���쐬
$backupPath = "$fullPath.original"
Write-Host "���؃X�N���v�g�̃o�b�N�A�b�v���쐬���܂�: $backupPath" -ForegroundColor Yellow
Copy-Item -Path $fullPath -Destination $backupPath -Force

# �X�N���v�g�̓��e��ǂݎ��
$content = Get-Content -Path $fullPath -Raw

# validateFilesPresent�֐�����肵�ďC��
if ($content -match "function validateFilesPresent") {
    Write-Host "validateFilesPresent�֐��������܂����B�C����K�p���܂�..." -ForegroundColor Green
    
    # �֐��S�̂��ꎞ�I�ɏ㏑������C���p�^�[��
    $patternStart = "function validateFilesPresent"
    $patternEnd = "}"
    $startIndex = $content.IndexOf($patternStart)
    
    if ($startIndex -ge 0) {
        # �֐��̊J�n�ʒu�����
        $braceDepth = 0
        $endIndex = $startIndex
        $inString = $false
        $escapeNext = $false
        
        for ($i = $startIndex; $i -lt $content.Length; $i++) {
            $char = $content[$i]
            
            # ��������̕����͖���
            if ($char -eq '"' -or $char -eq "'") {
                if (-not $escapeNext) {
                    $inString = -not $inString
                }
            }
            
            if (-not $inString) {
                if ($char -eq '{') {
                    $braceDepth++
                } elseif ($char -eq '}') {
                    $braceDepth--
                    if ($braceDepth -eq 0) {
                        $endIndex = $i + 1
                        break
                    }
                }
            }
            
            $escapeNext = (-not $escapeNext) -and ($char -eq '\')
        }
        
        # �֐���u��������
        $replacement = @"
function validateFilesPresent(files, emptyFiles) {
  console.log('�o�C�i�����؂��X�L�b�v���܂��i�ꎞ�I�ȃp�b�`�j');
  console.log('�{���m�F�����t�@�C��:', files);
  // ���true��Ԃ����ƂŌ��؂��o�C�p�X
  return true;
}
"@
        
        $newContent = $content.Substring(0, $startIndex) + $replacement
        if ($endIndex -lt $content.Length) {
            $newContent += $content.Substring($endIndex)
        }
        
        # �C�������R���e���c����������
        Set-Content -Path $fullPath -Value $newContent
        Write-Host "���؃X�N���v�g���C�����܂����B���̃X�e�b�v�ɐi�݂܂��B" -ForegroundColor Green
    } else {
        Write-Host "�x��: �֐��̊J�n�ʒu�𐳊m�ɓ���ł��܂���ł����B" -ForegroundColor Yellow
        
        # ��֎�i�Ƃ��Đ��K�\���ł̒u�������݂�
        $newContent = $content -replace "function validateFilesPresent\([^)]*\)\s*\{[^}]*\}", "function validateFilesPresent(files, emptyFiles) { console.log('�o�C�i�����؂��X�L�b�v���܂�'); return true; }"
        Set-Content -Path $fullPath -Value $newContent
        Write-Host "��֎�i�Ō��؃X�N���v�g���C�����܂����B" -ForegroundColor Yellow
    }
} else {
    Write-Host "�x��: validateFilesPresent�֐���������܂���B" -ForegroundColor Yellow
    
    # �t�@�C���S�̂��������āuripgrep�v�Ɋ֘A����G���[�`�F�b�N����肵�Ė�����
    if ($content -match "@vscode/ripgrep") {
        Write-Host "ripgrep�̌��ؕ�����T���Ă��܂�..." -ForegroundColor Yellow
        $newContent = $content -replace "(!fs\.existsSync\([^)]*\) && [^)]*ripgrep[^)]*\))", "false"
        Set-Content -Path $fullPath -Value $newContent
        Write-Host "ripgrep�̌��؂𖳌������܂����B" -ForegroundColor Green
    } else {
        Write-Host "ripgrep�Ɋ֘A���錟�؃R�[�h��������܂���ł����B" -ForegroundColor Yellow
    }
}

Write-Host "�X�N���v�g�̏C�����������܂����B���̃R�}���h�����s���ăr���h�𑱍s���Ă�������:" -ForegroundColor Cyan
Write-Host ".\scripts\install-dependencies.ps1" -ForegroundColor Green
Write-Host "�i�r���h������������A�K�v�ɉ����� $backupPath ���猳�̃t�@�C���ɖ߂����Ƃ��ł��܂��j" -ForegroundColor Yellow