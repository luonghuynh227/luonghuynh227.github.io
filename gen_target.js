/**
 * Tool t? d?ng t?o d? li?u Image Target cho 8th Wall WebAR
 * Cách dùng: node gen_target.js assets/ten_anh.jpg
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const imageArg = process.argv[2];
if (!imageArg) {
  console.log('? Vui lòng nh?p du?ng d?n file ?nh! Ví d?: node gen_target.js assets/gosu.jpg');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), imageArg);
if (!fs.existsSync(resolvedPath)) {
  console.log('? Không tìm th?y file ?nh t?i:', resolvedPath);
  process.exit(1);
}

const targetName = path.basename(imageArg, path.extname(imageArg));
console.log(`?? Ðang trích xu?t d? li?u AR cho ?nh [${targetName}]...`);

const proc = spawn('cmd.exe', ['/c', 'npx', '-y', '@8thwall/image-target-cli'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe']
});

proc.stdout.on('data', (d) => {
  const text = d.toString();
  process.stdout.write(text);

  if (text.includes('Enter the path to the image file:')) {
    proc.stdin.write(imageArg + '\n');
  } else if (text.includes('Select the image type:')) {
    proc.stdin.write('1\n');
  } else if (text.includes('Use default crop?')) {
    proc.stdin.write('Y\n');
  } else if (text.includes('output folder:')) {
    proc.stdin.write('image-targets\n');
  } else if (text.includes('name for the image target:')) {
    proc.stdin.write(targetName + '\n');
  }
});

proc.stderr.on('data', (d) => process.stderr.write(d.toString()));

proc.on('close', (code) => {
  if (code === 0) {
    console.log(`\n? THÀNH CÔNG! Ðã t?o xong image-targets/${targetName}.json và ?nh luminance tuong ?ng.`);
  } else {
    console.log(`\n? Quá trình k?t thúc v?i mã l?i: ${code}`);
  }
});
