import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateReply } from '../src/lib/automation';

async function main() {
  const output='generated-media/sabor-express-45s';
  await mkdir(output,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.route('**/api/assistant',async route=>{
    if(route.request().method()==='GET') await route.fulfill({json:{provider:'demo',ready:true,label:'Demonstração local · sem LLM'}});
    else {
      const {conversation}=route.request().postDataJSON();
      await route.fulfill({json:generateReply(conversation.messages.at(-1).text,conversation)});
    }
  });
  const page=await context.newPage();
  await page.goto('http://localhost:3000/whatsapp');
  await page.getByRole('button',{name:'Opções da conversa'}).click();
  await page.getByRole('button',{name:'Nova conversa',exact:true}).click();
  await page.getByLabel('Selecionar arquivo de áudio').setInputFiles('generated-media/sabor-express-conversa/cliente-voz.wav');
  const transcript=page.getByRole('textbox',{name:'Transcrição do áudio'});
  await expect(transcript).toBeVisible({timeout:50000});
  await expect(transcript).toHaveValue(/combo/i);
  await transcript.fill('Oi! Quero um combo pra retirar.');
  await page.getByRole('button',{name:'Enviar áudio',exact:true}).click();
  await expect(page.getByRole('button',{name:/Combo Clássico/})).toBeVisible({timeout:20000});
  const phone=page.locator('.phone-frame');
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.whatsapp-messages').evaluate(el=>{el.scrollTop=0;});
  await page.waitForTimeout(300);
  await phone.screenshot({path:`${output}/01-audio.png`});
  await page.getByRole('button',{name:/Combo Clássico/}).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await phone.screenshot({path:`${output}/02-cardapio.png`});
  await page.getByRole('button',{name:/Combo Clássico/}).click();
  await expect(page.locator('.message-bubble').last()).toContainText('Posso confirmar?',{timeout:20000});
  await expect(page.getByRole('button',{name:'Confirmar pedido',exact:true})).toBeEnabled();
  await page.waitForTimeout(400);
  await phone.screenshot({path:`${output}/03-resumo.png`});
  await page.getByRole('button',{name:'Confirmar pedido',exact:true}).click();
  await expect(page.locator('.message-bubble').last()).toContainText('confirmado na demonstração',{timeout:20000});
  await page.waitForTimeout(500);
  await phone.screenshot({path:`${output}/04-confirmado.png`});

  const inbox=await context.newPage();
  await inbox.setViewportSize({width:1280,height:738});
  await inbox.goto('http://localhost:3000/dashboard');
  await expect(inbox.locator('.order-status')).toHaveText('Em preparo');
  await inbox.locator('.order-card').scrollIntoViewIfNeeded();
  await inbox.waitForTimeout(400);
  await inbox.screenshot({path:`${output}/05-central.png`});
  const order=await inbox.locator('.order-card').textContent();
  const conversationId=await page.locator('.voice-composer-shell').getAttribute('data-conversation-id');
  await page.getByRole('textbox',{name:'Mensagem do cliente'}).fill('Quero falar com um atendente.');
  await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await expect(page.locator('.human-handoff')).toContainText('A equipe já recebeu',{timeout:20000});
  await page.waitForTimeout(300);
  await phone.screenshot({path:`${output}/06-transferencia-cliente.png`});
  await expect(inbox.getByRole('button',{name:'Assumir',exact:true})).toBeVisible();
  await inbox.screenshot({path:`${output}/07-transferencia-central.png`});
  await inbox.getByRole('button',{name:'Assumir',exact:true}).click();
  await expect(page.locator('.human-handoff')).toContainText('Ana está cuidando');
  await inbox.getByRole('textbox',{name:'Escrever resposta'}).fill('Oi! Sou a Ana. Já estou com os detalhes do seu pedido. Como posso ajudar?');
  await inbox.getByRole('button',{name:'Enviar',exact:true}).click();
  await inbox.locator('.order-card').scrollIntoViewIfNeeded();
  await inbox.waitForTimeout(400);
  await inbox.screenshot({path:`${output}/08-atendente.png`});
  await phone.screenshot({path:`${output}/09-cliente-atendente.png`});

  const crm=await context.newPage();
  await crm.setViewportSize({width:1280,height:738});
  await crm.goto('http://localhost:3000/crm');
  await expect(crm.locator('.crm-connection-card h2')).toHaveText(/Seu CRM está conectado|Conecte sua conta do CRM/,{timeout:15000});
  await crm.waitForTimeout(1200);
  await crm.screenshot({path:`${output}/10-crm.png`});
  const crmState=await crm.locator('.crm-connection-card').textContent();

  // Issue the real local survey, without submitting an invented score or a CRM event.
  await inbox.getByRole('button',{name:'Resolver',exact:true}).click();
  await expect(page.getByRole('region',{name:'Pesquisa de satisfação'})).toBeVisible({timeout:20000});
  await page.getByRole('region',{name:'Pesquisa de satisfação'}).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await phone.screenshot({path:`${output}/11-satisfacao.png`});
  await writeFile(`${output}/capture-info.json`,JSON.stringify({source:'Actual local Sabor Express app, existing demo assistant; live CRM read-only; real unscored local CSAT survey',conversationId,order,crmState,unit:'São Paulo · Pinheiros',created:new Date().toISOString()},null,2));
  await browser.close();
  console.log(`Eleven actual product captures saved to ${output}`);
}
main().catch(error=>{console.error(error);process.exit(1);});
