const d = new Date();
console.log('Machine date:', d.toString());
console.log('Formatted start of month:', d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01');
