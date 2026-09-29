const fs = require('fs');
const path = require('path');
['patient', 'staff', 'admin'].forEach(dir => {
  const jsPath = path.join(__dirname, 'frontend', dir, 'assets', dir + '.js');
  if (fs.existsSync(jsPath)) {
    let content = fs.readFileSync(jsPath, 'utf8');
    content = content.replace(/window\.location\.href\s*=\s*['"]dashboard\.html['"]/g, "window.location.href = '/" + dir + "/dashboard.html'");
    content = content.replace(/window\.location\.href\s*=\s*['"]index\.html['"]/g, "window.location.href = '/" + dir + "/index.html'");
    content = content.replace(/window\.location\.href\s*=\s*['"]request\.html['"]/g, "window.location.href = '/" + dir + "/request.html'");
    content = content.replace(/window\.location\.href\s*=\s*['"]\.\.\/index\.html['"]/g, "window.location.href = '/'");
    fs.writeFileSync(jsPath, content);
    console.log('Fixed redirects in ' + dir + '.js');
  }
});
