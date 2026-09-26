const fs = require('fs');
const path = require('path');

const dirs = ['patient', 'staff', 'admin'];

dirs.forEach(dir => {
  const dirPath = path.join(__dirname, 'frontend', dir);
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace href="something.html" with href="/dir/something.html"
    // Be careful not to replace already absolute paths or external links
    content = content.replace(/href="([a-zA-Z0-9_-]+\.html)"/g, 'href="/' + dir + '/$1"');
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated HTML links in ${dir}/${file}`);
  });
});

// Also fix the root index.html
const rootIndex = path.join(__dirname, 'frontend', 'index.html');
if (fs.existsSync(rootIndex)) {
  let content = fs.readFileSync(rootIndex, 'utf8');
  content = content.replace(/href="patient\/index\.html"/g, 'href="/patient/index.html"');
  content = content.replace(/href="staff\/index\.html"/g, 'href="/staff/index.html"');
  content = content.replace(/href="admin\/index\.html"/g, 'href="/admin/index.html"');
  fs.writeFileSync(rootIndex, content);
  console.log('Updated HTML links in root index.html');
}
