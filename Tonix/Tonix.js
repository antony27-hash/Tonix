/*
━━━━━━━━━━━━━━━━━━━━
     LEVVICODE LICENSE
━━━━━━━━━━━━━━━━━━━━

Base Name : LevviCode Base Bot
Developer : LevviCode
Telegram  : t.me/lepicode

[ LICENSE RULES ]

1. DO NOT REMOVE CREDIT
- Developer credit must be present
- The name "LevviCode" must not be removed
- Do not claim the full script as your own

2. PERMITTED
✔ Rename the bot name
✔ Edit appearance/menu
✔ Add features
✔ Fix bugs
✔ Recode for personal use

3. PROHIBITED
✘ Resell the source without permission
✘ Share private/premium base
✘ Encrypt and resell
✘ Remove developer watermark

4. USER RIGHTS
- Free to use the base for personal bot
- May offer running services
- May offer panel/install services
- Not allowed to resell the source without permission

5. VIOLATIONS
- Will not receive updates
- Will not receive support
- License considered void

By using this base,
you are considered to have agreed
to all the above rules.

© LevviCode - All Rights Reserved
━━━━━━━━━━━━━━━━━━━━
*/
const baileys = require('@whiskeysockets/baileys')

const {
    default: makeWASocket,
    proto,
    generateWAMessageFromContent,
    generateWAMessage,
    generateWAMessageContent,
    prepareWAMessageMedia,
    downloadContentFromMessage,
    downloadAndSaveMediaMessage,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    useSingleFileAuthState,
    makeInMemoryStore,
    DisconnectReason,
    Browsers
} = baileys

const os = require('os');
const util = require('util');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp')
const { exec } = require('child_process');
const { fileTypeFromBuffer } = require('file-type');
const { writeExif } = require('./lib/StickerMaker.js');

const config = require('./config.json');
const ownerPath = path.join(__dirname, 'database', 'owner.json');
const premiumPath = path.join(__dirname, 'database', 'premium.json');

const readJSON = (file) => {
    try {
        if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return [];
    }
};

const saveJSON = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

const getNumber = (jid = '') => String(jid).split('@')[0].replace(/\D/g, '');

const isCreator = (m) => {
    const sender = getNumber(m.sender);
    const creator = String(config.ownerNumber || '').replace(/\D/g, '');
    return sender === creator;
};

const isOwner = (m) => {
    const sender = getNumber(m.sender);
    const ownerDB = readJSON(ownerPath);
    const creator = String(config.ownerNumber || '').replace(/\D/g, '');
    return sender === creator || ownerDB.includes(sender);
};

const isPremium = (m) => {
    const sender = getNumber(m.sender);
    const premiumDB = readJSON(premiumPath);
    return isOwner(m) || premiumDB.includes(sender);
};

// System executeEval
const executeEval = async (code, conn, m) => {
    try {
        let result

        if (code.includes('\n') || code.includes(';')) {
            result = await eval(`
                (async (conn, m, require, fs, util) => {
                    ${code}
                })(conn, m, require, fs, util)
            `)
        } else {
            result = await eval(`
                (async (conn, m, require, fs, util) => {
                    return (${code})
                })(conn, m, require, fs, util)
            `)
        }

        if (typeof result !== 'string') {
            result = util.inspect(result, {
                depth: 1
            })
        }

        m.reply(result || 'undefined')
    } catch (e) {
        m.reply(String(e))
    }
}

// System detect ID for all buttons (button IDs do not use a dot)
const extractCommandFromMessage = (m) => {
    let body = '';
    let isButtonResponse = false;
    try {
        if (m.message) {
            if (m.message.conversation) body = m.message.conversation;
            else if (m.message.extendedTextMessage?.text) body = m.message.extendedTextMessage.text;
            else if (m.message.imageMessage?.caption) body = m.message.imageMessage.caption;
            else if (m.message.videoMessage?.caption) body = m.message.videoMessage.caption;
            else if (m.message.documentMessage?.caption) body = m.message.documentMessage.caption;
            else if (m.message.interactiveResponseMessage) {
                const inter = m.message.interactiveResponseMessage;
                if (inter.nativeFlowResponseMessage) {
                    const flow = inter.nativeFlowResponseMessage;
                    if (flow.paramsJson) {
                        try {
                            const params = JSON.parse(flow.paramsJson);
                            body = params.id || params.buttonId || params.rowId || params.index || '';
                        } catch { body = flow.name || ''; }
                    } else body = flow.name || '';
                    isButtonResponse = true;
                } else if (inter.buttonReply) {
                    body = inter.buttonReply.selectedButtonId || '';
                    isButtonResponse = true;
                } else if (inter.singleSelectReply) {
                    body = inter.singleSelectReply.selectedRowId || '';
                    isButtonResponse = true;
                }
            } else if (m.message.templateButtonReplyMessage) {
                body = m.message.templateButtonReplyMessage.selectedId || '';
                isButtonResponse = true;
            } else if (m.message.buttonsResponseMessage) {
                body = m.message.buttonsResponseMessage.selectedButtonId || '';
                isButtonResponse = true;
            }
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
    return { body, isButtonResponse };
};




module.exports = async (conn, m) => {
    try {
        const { body, isButtonResponse } = extractCommandFromMessage(m);
        if (!body) return;
        if (body) m.text = body;

        let command = '';
        let args = [];

        if (isButtonResponse) {
            const parts = body.split(/ +/);
            command = parts[0].toLowerCase();
            args = parts.slice(1);
        } else {
            const trimmed = body.trim();
            if (trimmed.startsWith(']>')) {
                if (!isCreator(m)) return m.reply('Eval command is only for creator.');
                const evalCode = trimmed.slice(2).trim();
                if (!evalCode) return m.reply('Example:\n]> 1+1');
                return await executeEval(evalCode, conn, m);
            }
            if (trimmed.startsWith('$')) {
                if (!isCreator(m)) return m.reply('❌ Shell command is only for creator.');
                const shellCmd = trimmed.slice(1).trim();
                if (!shellCmd) return m.reply('Example: $ ls -la');
                m.reply('⏳ Running shell command...');
                exec(shellCmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
                    let output = stdout || stderr || error?.message || '✅ Done (no output)';
                    if (output.length > 2000) output = output.slice(0, 2000) + '\n... (output truncated)';
                    m.reply(`💻 Output:\n${output}`);
                });
                return;
            }
            if (body.startsWith(config.prefix || '.')) {
                const cleanBody = body.slice(1).trim();
                const parts = cleanBody.split(/ +/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            } else {
                return;
            }
        }

        const { reply } = m;

        const thumb = await sharp('./src/img/menu.jpg')
        .resize(300, 300)
        .jpeg({ quality: 80 })
        .toBuffer()

       // Self
       if (config.mode === 'self' && !isCreator(m)) return
       //Case
        switch (command) {

        case 'menu': {
    const runtime = process.uptime()

    const days = Math.floor(runtime / 86400)
    const hours = Math.floor((runtime % 86400) / 3600)
    const minutes = Math.floor((runtime % 3600) / 60)
    const seconds = Math.floor(runtime % 60)

    const ping = Date.now() - (Number(m.messageTimestamp) * 1000)
    const mode = config.mode === 'self' ? 'SELF' : 'PUBLIC'

    await conn.relayMessage(
        m.chat,
        {
            buttonsMessage: {
                locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    name: 'LevviCode',
                    address: 'LevviCode',
                    jpegThumbnail: thumb
                },
contentText: `
┏━━━〔 BOT INFO 〕━━━⬣
┃
┃❍ Bot Name : LevviCode Base Bot
┃❍ Developer : LevviCode
┃❍ Telegram : t.me/lepicode
┃❍ Type : Case
┃❍ Mode : ${mode}
┃❍ Number : ${String(m.sender).replace(/@.+/g, '')}
┃❍ Ping : ${Math.floor(ping)} ms
┃❍ Runtime : ${days}D ${hours}H ${minutes}M ${seconds}S
┃
┗━━━━━━━━━━━━━━⬣

Click the button below to see all menus.`,
                footerText: 'LevviCode Bot',
                buttons: [
                    {
                        buttonId: 'allmenu',
                        buttonText: {
                            displayText: 'All Menu'
                        },
                        type: 1
                    }
                ],
                headerType: 6
            }
        },
        {
            quoted: m,
            messageId: conn.generateMessageTag()
        }
    )
    break
}

        case 'allmenu': {
            await conn.relayMessage(
        m.chat,
        {
            buttonsMessage: {
                locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    name: 'LevviCode',
                    address: 'LevviCode',
                    jpegThumbnail: thumb
                },
                contentText: `*ALL MENU*

MAIN MENU
• menu
• ping
• info
• owner
• myjid

STICKER MENU
• sticker
• s

OWNER MENU
• addowner
• delowner
• addprem
• delprem
• eval`,
                footerText: 'LevviCode Bot',
                buttons: [
                    {
                        buttonId: 'menu',
                        buttonText: {
                            displayText: 'Back Menu'
                        },
                        type: 1
                    },
                    {
                        buttonId: 'owner',
                        buttonText: {
                            displayText: 'Owner Menu'
                        },
                        type: 1
                    }
                ],
                headerType: 6
            }
        },
        {
            quoted: m,
            messageId: conn.generateMessageTag()
        }
    )
    break
}

            case 'owner':
            case 'cekowner': {
                const creator = isCreator(m);
                const owner = isOwner(m);
                const status = creator ? '👑 You are the CREATOR' : owner ? '✅ You are an OWNER' : '❌ You are not an owner';
                const info = `Your JID: ${m.sender}\nCreator: ${config.ownerNumber}@s.whatsapp.net`;
                await reply(`${status}\n\n${info}`);
                break;
            }

            case 'myjid':
                await reply(`Your JID: ${m.sender}`);
                break;

            case 'ping': {
                const start = Date.now();
                const sent = await reply('Measuring ping...');
                const latency = Date.now() - start;
                const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
                const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
                const uptimeHours = (os.uptime() / 3600).toFixed(2);
                const cpuModel = os.cpus()[0]?.model || 'Unknown';
                const cpuCores = os.cpus().length;
                const vpsText = `VPS DATA\n- Hostname: ${os.hostname()}\n- Platform: ${os.platform()} ${os.arch()}\n- Uptime: ${uptimeHours} hours\n- RAM: ${freeMem} GB / ${totalMem} GB (Free/Total)\n- CPU: ${cpuCores} Core, ${cpuModel.substring(0, 30)}`;
                await conn.sendMessage(m.chat, { text: `Pong! ${latency} ms\n\n${vpsText}`, edit: sent.key });
                break;
            }

            case 'info': {  
                await reply(`MESSAGE INFO\n\nSender JID: ${m.sender}\nChat JID: ${m.chat}\nGroup: ${m.isGroup ? 'Yes' : 'No'}\nFrom Bot: ${m.fromMe ? 'Yes' : 'No'}\nMessage ID: ${m.id || '-'}\nText: ${m.text || '-'}`);
                break;
            }

            case 'sticker':
            case 's': {
                if (!m.quoted && !args[0]) return reply('Reply to an image/video or send a URL with .sticker <url>');
                let mediaBuffer;
                if (m.quoted && (m.quoted.mtype === 'imageMessage' || m.quoted.mtype === 'videoMessage')) {
                    mediaBuffer = await m.quoted.download();
                } else if (args[0] && args[0].match(/https?:\/\//)) {
                    const res = await fetch(args[0]);
                    mediaBuffer = Buffer.from(await res.arrayBuffer());
                } else return reply('Unknown format. Reply to media or send a URL.');
                if (!mediaBuffer) return reply('Failed to fetch media.');
                const type = await fileTypeFromBuffer(mediaBuffer);
                if (!type || (!/image/.test(type.mime) && !/video/.test(type.mime))) return reply('Only images or videos are supported.');
                await reply('Creating sticker...');
                try {
                    const stickerBuffer = await writeExif(mediaBuffer, { packname: 'Sticker Bot', author: 'LevviCode', cropToSquare: false });
                    await conn.sendMessage(m.chat, { sticker: stickerBuffer }, { quoted: m });
                } catch (err) {
                    console.error(err);
                    await reply('Failed to create sticker: ' + err.message);
                }
                break;
            }

            case 'addowner': {
                if (!isCreator(m)) return reply('Creator only');
                let target = args[0];
                if (m.mentionedJid?.[0]) target = m.mentionedJid[0];
                if (!target) return reply('Example: .addowner 628xxx');
                const ownerDB = readJSON(ownerPath);
                const num = getNumber(target);
                if (ownerDB.includes(num)) return reply('Already an owner');
                ownerDB.push(num);
                saveJSON(ownerPath, ownerDB);
                reply(`Successfully added owner\n${num}`);
                break;
            }

            case 'delowner': {
                if (!isCreator(m)) return reply('Creator only');
                let target = args[0];
                if (m.mentionedJid?.[0]) target = m.mentionedJid[0];
                if (!target) return reply('Example: .delowner 628xxx');
                const ownerDB = readJSON(ownerPath);
                const num = getNumber(target);
                const filtered = ownerDB.filter(v => v !== num);
                saveJSON(ownerPath, filtered);
                reply(`Successfully removed owner\n${num}`);
                break;
            }

            case 'addprem': {
                if (!isOwner(m)) return reply('Owner only');
                let target = args[0];
                if (m.mentionedJid?.[0]) target = m.mentionedJid[0];
                if (!target) return reply('Example: .addprem 628xxx');
                const premiumDB = readJSON(premiumPath);
                const num = getNumber(target);
                if (premiumDB.includes(num)) return reply('Already premium');
                premiumDB.push(num);
                saveJSON(premiumPath, premiumDB);
                reply(`Successfully added premium user\n${num}`);
                break;
            }

            case 'delprem': {
                if (!isOwner(m)) return reply('Owner only');
                let target = args[0];
                if (m.mentionedJid?.[0]) target = m.mentionedJid[0];
                if (!target) return reply('Example: .delprem 628xxx');
                const premiumDB = readJSON(premiumPath);
                const num = getNumber(target);
                const filtered = premiumDB.filter(v => v !== num);
                saveJSON(premiumPath, filtered);
                reply(`Successfully removed premium user\n${num}`);
                break;
            }

            case 'eval': {
                if (!isCreator(m)) return reply('Creator only');
                const code = args.join(' ');
                if (!code) return reply('Example:\n.eval 1+1');
                await executeEval(code, conn, m);
                break;
            }
            
           case 'public': {
    if (!isOwner(m)) return reply('Owner only')

    config.mode = 'public'
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))

    reply('Successfully changed mode to public')
}
           break

           case 'self': {
    if (!isOwner(m)) return reply('Owner only')

    config.mode = 'self'
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))

    reply('Successfully changed mode to self')
}
           break
           
           
            default:
                break;
        }
    } catch (err) {
        console.error('Error in command handler:', err);
    }
};
