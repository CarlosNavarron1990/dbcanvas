import fs from 'fs';
const nodes = JSON.parse(fs.readFileSync('/Users/xmn/Documents/Trabajo/Savar/Govari/sisGoVari/.dbcanvas/nodes.json', 'utf8'));
console.log(JSON.stringify(nodes.slice(0, 10), null, 2));
console.log('Total nodes:', nodes.length);
