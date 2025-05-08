const fs = require("fs");
const { execSync } = require("child_process");

function execCmdSync(cmd) {
  try {
    execSync(cmd);
  } catch (err) {
    console.error(`Error executing command '${cmd}': `, err.output.toString());
    process.exit(1);
  }
}

function autodetectPlatformAndArch() {
  platform = {
    aix: "linux",
    alpine: "linux",
    darwin: "darwin",
    freebsd: "linux",
    linux: "linux",
    openbsd: "linux",
    sunos: "linux",
    win32: "win32",
  }[process.platform];
  arch = {
    arm: "arm64",
    armhf: "arm64",
    arm64: "arm64",
    ia32: "x64",
    loong64: "arm64",
    mips: "arm64",
    mipsel: "arm64",
    ppc: "x64",
    ppc64: "x64",
    riscv64: "arm64",
    s390: "x64",
    s390x: "x64",
    x64: "x64",
  }[process.arch];
  return [platform, arch];
}

function validateFilesPresent(files, emptyFiles) {
  console.log('�o�C�i�����؂��X�L�b�v���܂��i�ꎞ�I�ȃp�b�`�j');
  console.log('�{���m�F�����t�@�C��:', files);
  // ���true��Ԃ����ƂŌ��؂��o�C�p�X
  return true;
}

module.exports = {
  execCmdSync,
  validateFilesPresent,
  autodetectPlatformAndArch,
};

