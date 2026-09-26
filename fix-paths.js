const fs = require('fs');
const path = require('path');
const dirs = ['patient', 'staff', 'admin'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, 'frontend', dir);
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/href="assets\//g, 'href="/' + dir + '/assets/');
    content = content.replace(/src="assets\//g, 'src="/' + dir + '/assets/');
    fs.writeFileSync(filePath, content);
  });
});
console.log('Done replacing assets paths.');
