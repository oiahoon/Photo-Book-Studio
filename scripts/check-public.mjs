import {execFileSync} from 'node:child_process';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';

const root=resolve(process.cwd());
const index=process.argv.indexOf('--artifact');
const forbiddenPath=/(^|\/)(\.local|node_modules|analysis-tasks|output|tmp)(\/|$)|(^|\/)(AGENTS\.md|design-qa\.md|\.env[^/]*|[^/]*\.(?:photobook|sqlite(?:-\w+)?|db(?:-\w+)?|pem|key|jpe?g|png|heic|heif|3fr|pdf|ttc))$/i;
const secret=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
let checked=0;
async function inspect(path,bytes){
 if(forbiddenPath.test(path)||path.startsWith('docs/')&&!path.startsWith('docs/public/'))throw Error('Private path in release: '+path);
 const text=bytes.toString('utf8');
 if(secret.test(text))throw Error('Credential-like content in release: '+path);
 if(/\/Users\/[A-Za-z0-9_.-]+\//.test(text))throw Error('Personal absolute path in release: '+path);
 checked++;
}
if(index>=0){
 const target=resolve(process.argv[index+1]||'dist-browser');
 if(target!==join(root,'dist-browser'))throw Error('Only dist-browser can be a Pages artifact');
 async function walk(dir){for(const name of await readdir(dir)){const path=join(dir,name),info=await lstat(path),rel=relative(target,path).replaceAll('\\','/');if(info.isSymbolicLink())throw Error('Symlink in artifact: '+rel);if(info.isDirectory()){if(rel!=='assets')throw Error('Unexpected artifact directory: '+rel);await walk(path);}else{if(!/^(?:index\.html|favicon\.svg|assets\/[^/]+\.(?:js|css|woff2?))$/.test(rel))throw Error('Unexpected artifact file: '+rel);await inspect(rel,await readFile(path));}}}
 await walk(target);
 if(!(await readFile(join(target,'index.html'),'utf8')).includes('Content-Security-Policy'))throw Error('Missing browser CSP');
}else{
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 if(!files.length)throw Error('No tracked release files');
 for(const file of files)await inspect(file,execFileSync('git',['show',':'+file]));
}
console.log(`Public-release check passed: ${checked} files; no private media or local data.`);
