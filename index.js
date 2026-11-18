const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const readline = require('readline');

const BARTOK_URL = process.env.BARTOK_URL || "https://bartok-negocio1.onrender.com/hablar";

// Configuración para leer desde la consola de Render si es necesario
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // Desactivamos el QR tradicional
    });

    // Si tu cuenta no está vinculada, pedimos un código de emparejamiento por número de teléfono
    if (!sock.authState.creds.registered) {
        // Puedes cambiar esto por tu número de teléfono con código de país (ej. 521XXXXXXXXXX)
        const phoneNumber = await question('Introduce tu número de WhatsApp con código de país (ej. 521...): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`========================================`);
        console.log(` TU CÓDIGO DE EMPAREJAMIENTO ES: ${code} `);
        console.log(`========================================`);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
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
