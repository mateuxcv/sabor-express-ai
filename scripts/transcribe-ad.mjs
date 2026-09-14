import { readFile, writeFile } from 'node:fs/promises';

const filename = process.argv[2] || 'generated-media/sabor-express/source-audio.wav';
const form = new FormData();
form.set('file', new File([await readFile(filename)], 'advertisement.wav', { type: 'audio/wav' }));
const response = await fetch('http://localhost:3000/api/audio/transcribe', { method: 'POST', body: form });
const result = await response.json();
console.log(JSON.stringify({ status: response.status, ...result }, null, 2));
if (!response.ok) process.exitCode = 1;
else await writeFile(filename.replace(/\.wav$/, '-transcript.json'), JSON.stringify(result, null, 2));
