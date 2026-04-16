const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx')) results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
let changed = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content
    .replace(/from-blue-600 to-indigo-600/g, 'from-orange-500 to-orange-600')
    .replace(/hover:from-blue-700 hover:to-indigo-700/g, 'hover:from-orange-600 hover:to-orange-700')
    .replace(/shadow-blue-600\/25/g, 'shadow-orange-500/25')
    .replace(/text-blue-600/g, 'text-orange-600')
    .replace(/text-blue-700/g, 'text-orange-700');
    
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    changed++;
  }
});

console.log(`Replaced in ${changed} files`);
