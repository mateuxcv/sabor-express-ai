// Local binary preparation: originals remain in generated-media/.
import { copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const output = 'public/apresentacao';
await mkdir(output, { recursive: true });
const images = [
  ['generated-media/image-454ee29b-6bbd-4b0a-98c9-9bbbed6c5ba9-1.png', 'abertura.webp', 1920],
  ['generated-media/image-ed699ac7-ecdf-4e8e-90c4-b2771f3f817f-1.png', 'cliente.webp', 1600],
  ['generated-media/image-2f4ef902-0af5-48e1-8ba4-6347c2cbeb79-1.png', 'operacao.webp', 1600],
  ['generated-media/sabor-express-conversa/05-dashboard.png', 'dashboard.webp', 2000],
  ['generated-media/sabor-express-conversa/04-pedido-confirmado.png', 'pedido.webp', 730],
  ['generated-media/sabor-express-conversa/poster.jpg', 'video-capa.webp', 1280],
  ['generated-media/image-6582c127-d5dc-4a47-83d0-fe20a711a770-1.png', 'fase-diagnostico.webp', 1200],
  ['generated-media/image-6ace6e84-ff4f-46f4-88d4-226833e1250a-1.png', 'fase-preparacao.webp', 1200],
  ['generated-media/image-ae6038fb-68d2-4c9d-9f08-408b52984192-1.png', 'fase-piloto.webp', 1200],
  ['generated-media/image-805f3dfd-a716-4631-8321-3ea3ccf415be-1.png', 'fase-expansao.webp', 1200],
];
for (const [source, name, width] of images) {
  await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 90 }).toFile(`${output}/${name}`);
}
await copyFile('generated-media/sabor-express-conversa/sabor-express-conversa-e-controle-12s.mp4', `${output}/comercial-12s.mp4`);
console.log('Presentation media prepared in public/apresentacao');
