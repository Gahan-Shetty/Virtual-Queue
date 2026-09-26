const fs = require('fs');
const path = require('path');

const dirs = ['patient', 'staff', 'admin'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, 'frontend', dir);
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  
  files.forEach(file => {
    const fp = path.join(dirPath, file);
    let content = fs.readFileSync(fp, 'utf8');
    
    const tokenStr = 'style="text-decoration: none; color: inherit;"';
    
    // For admin
    if (dir === 'admin' && !content.includes(tokenStr)) {
      content = content.replace(/<h2>\s*Virtual Queue Admin\s*<\/h2>/g, '<a href="/admin/dashboard.html" style="text-decoration: none; color: inherit;"><h2>Virtual Queue Admin</h2></a>');
    }
    
    // For staff
    if (dir === 'staff' && !content.includes(tokenStr)) {
      content = content.replace(/<h2>\s*Virtual Queue\s*<\/h2>/g, '<a href="/staff/console.html" style="text-decoration: none; color: inherit;"><h2>Virtual Queue</h2></a>');
    }
    
    // For patient
    if (dir === 'patient') {
      if (file === 'dashboard.html' && !content.includes(tokenStr)) {
        content = content.replace(/<h1 class="display-title">\s*Your Token\s*<\/h1>/g, '<a href="/patient/dashboard.html" style="text-decoration: none; color: inherit;"><h1 class="display-title">Your Token</h1></a>');
      }
      if (file === 'request.html' && !content.includes(tokenStr)) {
        content = content.replace(/<h1 class="display-title">\s*Request Token\s*<\/h1>/g, '<a href="/patient/dashboard.html" style="text-decoration: none; color: inherit;"><h1 class="display-title">Request Token</h1></a>');
      }
      if (file === 'index.html' && !content.includes(tokenStr)) {
        content = content.replace(/<h1 class="display-title">\s*Virtual Queue\s*<\/h1>/g, '<a href="/patient/dashboard.html" style="text-decoration: none; color: inherit;"><h1 class="display-title">Virtual Queue</h1></a>');
      }
    }
    
    fs.writeFileSync(fp, content);
    console.log('Processed', fp);
  });
});

// Update main index.html
const rootIndex = path.join(__dirname, 'frontend', 'index.html');
if (fs.existsSync(rootIndex)) {
  let content = fs.readFileSync(rootIndex, 'utf8');
  if (!content.includes('style="text-decoration: none; color: inherit;"')) {
    content = content.replace(/<h1>\s*Virtual Queue\s*<\/h1>/g, '<a href="/" style="text-decoration: none; color: inherit;"><h1>Virtual Queue</h1></a>');
    fs.writeFileSync(rootIndex, content);
    console.log('Processed root index.html');
  }
}
