const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');

const BARTOK_URL = process.env.BARTOK_URL || "https://bartok-negocio1.onrender.com/hablar";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Desactivamos el QR de líneas rotas
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- CÓDIGO QR GENERADO ---');
            console.log('Copia este texto y conviértelo a QR en cualquier página web gratuita (como qrcode-monkey.com):');
            console.log(qr);
            console.log('---------------------------');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('¡Bartok se ha conectado a WhatsApp exitosamente, Jefe!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderID = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        console.log(`Mensaje recibido de ${senderID}: ${textMessage}`);

        try {
            const response = await axios.get(BARTOK_URL, {
                params: { mensaje: textMessage }
            });

            const respuestaBartok = response.data.respuesta || "¡Oh no, Jefe! No obtuve respuesta clara del servidor.";
            await sock.sendMessage(senderID, { text: respuestaBartok });

        } catch (error) {
            console.error('Error al comunicarse con Bartok en Render:', error.message);
            await sock.sendMessage(senderID, { text: "¡Ay, caray, Jefe! Hubo un pequeño fallo al consultar mi memoria en el servidor." });
        }
    });
}

connectToWhatsApp();
